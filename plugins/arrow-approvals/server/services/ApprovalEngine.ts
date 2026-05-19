import { Op, type Transaction } from "sequelize";
import httpErrors from "http-errors";
import type Document from "@server/models/Document";
import type User from "@server/models/User";
import ArrowReviewAction, {
  type ReviewActionType,
} from "../models/ArrowReviewAction";
import ArrowReviewRequest from "../models/ArrowReviewRequest";

/**
 * Service object encapsulating the approval state machine. Lives outside
 * the API layer so the same logic is shared by:
 *   - HTTP routes (api/router.ts)
 *   - Document edit-lock hook (hooks/documentLock.ts)
 *   - Reminder worker (in arrow-reminders plugin)
 *
 * Every method that mutates state takes a transaction so the caller can
 * compose with other DB writes atomically.
 */
export class ApprovalEngine {
  /**
   * Open a new review request on a document.
   *
   * @throws if the author is among the listed reviewers
   * @throws if threshold > reviewer count or < 1
   * @throws if there is already an open (pending or changes_requested) review
   */
  static async requestReview(
    args: {
      author: User;
      document: Document;
      reviewerIds: string[];
      threshold: number;
    },
    transaction: Transaction
  ): Promise<ArrowReviewRequest> {
    const { author, document, reviewerIds, threshold } = args;

    if (reviewerIds.includes(author.id)) {
      throw httpErrors(400, "author cannot be reviewer", {
        id: "author_cannot_be_reviewer",
        isReportable: false,
      });
    }
    if (threshold < 1) {
      throw httpErrors(400, "threshold must be at least 1", {
        id: "invalid_threshold",
        isReportable: false,
      });
    }
    if (threshold > reviewerIds.length) {
      throw httpErrors(400, "threshold exceeds reviewer count", {
        id: "threshold_exceeds_reviewer_count",
        isReportable: false,
      });
    }

    const existing = await ArrowReviewRequest.findOne({
      where: {
        documentId: document.id,
        state: ["pending", "changes_requested"],
      },
      transaction,
    });
    if (existing) {
      throw httpErrors(409, "review already pending", {
        id: "review_already_pending",
        isReportable: false,
      });
    }

    const request = await ArrowReviewRequest.create(
      {
        documentId: document.id,
        requestedById: author.id,
        requiredReviewers: reviewerIds,
        threshold,
        state: "pending",
        revisionId:
          (document as unknown as { revisionId?: string }).revisionId ?? null,
      },
      { transaction }
    );
    return request;
  }

  /**
   * Reviewer approves. Transitions to `approved` if the threshold is met,
   * otherwise stays `pending`.
   */
  static async approve(
    args: {
      request: ArrowReviewRequest;
      reviewer: User;
      comment?: string;
      document: Document;
    },
    transaction: Transaction
  ): Promise<{ request: ArrowReviewRequest; transitionedToApproved: boolean }> {
    const { request, reviewer, comment, document } = args;
    await this.assertActionableBy(request, reviewer, "approve");

    await ArrowReviewAction.create(
      {
        requestId: request.id,
        userId: reviewer.id,
        action: "approve",
        body: comment ?? null,
        revisionId:
          (document as unknown as { revisionId?: string }).revisionId ?? null,
      },
      { transaction }
    );

    const approvalCount = await this.countActions(
      request.id,
      "approve",
      transaction
    );
    if (approvalCount >= request.threshold) {
      request.state = "approved";
      request.completedAt = new Date();
      await request.save({ transaction });
      return { request, transitionedToApproved: true };
    }
    return { request, transitionedToApproved: false };
  }

  /**
   * Reviewer requests changes. Comment is required.
   * Prior approvals are NOT preserved — the next round of review starts
   * fresh (matches "prior approvals reset on changes_requested" scenario).
   */
  static async requestChanges(
    args: {
      request: ArrowReviewRequest;
      reviewer: User;
      comment: string;
      document: Document;
    },
    transaction: Transaction
  ): Promise<ArrowReviewRequest> {
    const { request, reviewer, comment, document } = args;
    if (!comment || !comment.trim()) {
      throw httpErrors(400, "comment is required", {
        id: "comment_required",
        isReportable: false,
      });
    }
    await this.assertActionableBy(request, reviewer, "request_changes");

    await ArrowReviewAction.create(
      {
        requestId: request.id,
        userId: reviewer.id,
        action: "request_changes",
        body: comment,
        revisionId:
          (document as unknown as { revisionId?: string }).revisionId ?? null,
      },
      { transaction }
    );

    request.state = "changes_requested";
    await request.save({ transaction });
    return request;
  }

  /**
   * Author cancels a pending or changes_requested review.
   */
  static async cancel(
    args: { request: ArrowReviewRequest; actor: User },
    transaction: Transaction
  ): Promise<ArrowReviewRequest> {
    const { request, actor } = args;
    if (actor.id !== request.requestedById) {
      throw httpErrors(403, "only the author can cancel review", {
        id: "permission_denied",
        isReportable: false,
      });
    }
    if (request.state !== "pending" && request.state !== "changes_requested") {
      throw httpErrors(409, "review is not in a cancellable state", {
        id: "invalid_state",
        isReportable: false,
      });
    }
    await ArrowReviewAction.create(
      {
        requestId: request.id,
        userId: actor.id,
        action: "cancel",
        body: null,
      },
      { transaction }
    );
    request.state = "cancelled";
    request.completedAt = new Date();
    await request.save({ transaction });
    return request;
  }

  /**
   * Author re-requests review after addressing change requests. Resets
   * the request to `pending` and wipes prior approval *counts* (the audit
   * log entries remain, but a fresh round of approvals must be collected).
   *
   * @throws if the document has not been edited since changes were requested
   */
  static async reRequest(
    args: { request: ArrowReviewRequest; actor: User; document: Document },
    transaction: Transaction
  ): Promise<ArrowReviewRequest> {
    const { request, actor, document } = args;

    if (actor.id !== request.requestedById) {
      throw httpErrors(403, "only the author can re-request review", {
        id: "permission_denied",
        isReportable: false,
      });
    }
    if (request.state !== "changes_requested") {
      throw httpErrors(409, "review is not awaiting re-request", {
        id: "invalid_state",
        isReportable: false,
      });
    }

    // Find the most recent request_changes action.
    const lastChangeRequest = await ArrowReviewAction.findOne({
      where: { requestId: request.id, action: "request_changes" },
      order: [["createdAt", "DESC"]],
      transaction,
    });
    if (!lastChangeRequest) {
      throw httpErrors(500, "no prior request_changes action", {
        id: "internal_error",
      });
    }
    const docUpdated = (document as unknown as { updatedAt?: Date }).updatedAt;
    if (docUpdated && docUpdated <= lastChangeRequest.createdAt) {
      throw httpErrors(409, "no edits since changes were requested", {
        id: "no_changes_since_request",
        isReportable: false,
      });
    }

    await ArrowReviewAction.create(
      {
        requestId: request.id,
        userId: actor.id,
        action: "re_request",
        revisionId:
          (document as unknown as { revisionId?: string }).revisionId ?? null,
      },
      { transaction }
    );
    request.state = "pending";
    request.revisionId =
      (document as unknown as { revisionId?: string }).revisionId ?? null;
    await request.save({ transaction });
    return request;
  }

  /**
   * Edit the reviewer list on an active (pending or changes_requested)
   * review. Only the author can do this. Approvals from removed reviewers
   * remain in the audit log but no longer count toward the threshold;
   * approvals from kept reviewers are preserved.
   *
   * @throws if not author, or review is in a terminal state.
   */
  static async editReviewers(
    args: {
      request: ArrowReviewRequest;
      actor: User;
      reviewerIds: string[];
      threshold?: number;
    },
    transaction: Transaction
  ): Promise<ArrowReviewRequest> {
    const { request, actor, reviewerIds, threshold } = args;
    if (actor.id !== request.requestedById) {
      throw httpErrors(403, "only the author can edit reviewers", {
        id: "permission_denied",
        isReportable: false,
      });
    }
    if (request.state !== "pending" && request.state !== "changes_requested") {
      throw httpErrors(409, "review is not in an editable state", {
        id: "invalid_state",
        isReportable: false,
      });
    }
    if (reviewerIds.includes(actor.id)) {
      throw httpErrors(400, "author cannot be reviewer", {
        id: "author_cannot_be_reviewer",
        isReportable: false,
      });
    }
    const newThreshold =
      threshold ?? Math.min(request.threshold, reviewerIds.length);
    if (newThreshold < 1) {
      throw httpErrors(400, "threshold must be at least 1", {
        id: "invalid_threshold",
        isReportable: false,
      });
    }
    if (newThreshold > reviewerIds.length) {
      throw httpErrors(400, "threshold exceeds reviewer count", {
        id: "threshold_exceeds_reviewer_count",
        isReportable: false,
      });
    }
    request.requiredReviewers = reviewerIds;
    request.threshold = newThreshold;
    await request.save({ transaction });
    return request;
  }

  /**
   * Approved-doc unlock — author flips the doc back to draft for further
   * edits. The prior review request is closed (state stays `approved` for
   * historical record) and edits are unblocked.
   */
  static async unlock(
    args: { request: ArrowReviewRequest; actor: User },
    transaction: Transaction
  ): Promise<void> {
    const { request, actor } = args;
    if (actor.id !== request.requestedById) {
      throw httpErrors(403, "only the author can unlock", {
        id: "permission_denied",
        isReportable: false,
      });
    }
    if (request.state !== "approved") {
      throw httpErrors(409, "review is not in approved state", {
        id: "invalid_state",
        isReportable: false,
      });
    }
    await ArrowReviewAction.create(
      {
        requestId: request.id,
        userId: actor.id,
        action: "unlock",
      },
      { transaction }
    );
    // We DON'T flip the request state — keeping it `approved` preserves the
    // historical record. Instead, the document edit-lock hook treats a
    // following `unlock` action as "no longer locked."
  }

  // ── helpers ────────────────────────────────────────────────────────────

  private static async assertActionableBy(
    request: ArrowReviewRequest,
    reviewer: User,
    _action: ReviewActionType
  ): Promise<void> {
    if (reviewer.id === request.requestedById) {
      throw httpErrors(403, "author cannot approve own review", {
        id: "author_cannot_approve",
        isReportable: false,
      });
    }
    if (!request.requiredReviewers.includes(reviewer.id)) {
      throw httpErrors(403, "you are not listed as a reviewer", {
        id: "not_a_reviewer",
        isReportable: false,
      });
    }
    if (request.state !== "pending") {
      throw httpErrors(409, "review is not pending", {
        id: "invalid_state",
        isReportable: false,
      });
    }
    // Already-acted check.
    const roundStartedAt = await this.currentRoundStartedAt(request.id);
    const existing = await ArrowReviewAction.findOne({
      where: {
        requestId: request.id,
        userId: reviewer.id,
        action: ["approve", "request_changes"],
        ...(roundStartedAt && {
          createdAt: {
            [Op.gte]: roundStartedAt,
          },
        }),
      },
    });
    if (existing) {
      throw httpErrors(409, "you have already acted on this review", {
        id: "already_acted",
        isReportable: false,
      });
    }
  }

  private static async countActions(
    requestId: string,
    action: ReviewActionType,
    transaction: Transaction
  ): Promise<number> {
    const roundStartedAt = await this.currentRoundStartedAt(
      requestId,
      transaction
    );
    return ArrowReviewAction.count({
      where: {
        requestId,
        action,
        ...(roundStartedAt && {
          createdAt: {
            [Op.gte]: roundStartedAt,
          },
        }),
      },
      transaction,
    });
  }

  private static async currentRoundStartedAt(
    requestId: string,
    transaction?: Transaction
  ): Promise<Date | null> {
    const reRequest = await ArrowReviewAction.findOne({
      where: { requestId, action: "re_request" },
      order: [["createdAt", "DESC"]],
      transaction,
    });

    return reRequest?.createdAt ?? null;
  }

  /**
   * Look up the *current* lock state of a document — used by the edit-lock
   * hook on Document.beforeUpdate.
   *
   * Returns true if there is an `approved` review request for the document
   * with no subsequent `unlock` action.
   */
  static async isLocked(documentId: string): Promise<boolean> {
    const approved = await ArrowReviewRequest.findOne({
      where: { documentId, state: "approved" },
      order: [["completedAt", "DESC"]],
    });
    if (!approved) {
      return false;
    }
    const unlock = await ArrowReviewAction.findOne({
      where: { requestId: approved.id, action: "unlock" },
    });
    return !unlock;
  }
}
