import Router from "koa-router";
import { Op, type Transaction } from "sequelize";
import httpErrors from "http-errors";
import { Collection, Document, Revision } from "@server/models";
import auth from "@server/middlewares/authentication";
import { transaction } from "@server/middlewares/transaction";
import validate from "@server/middlewares/validate";
import { authorize } from "@server/policies";
import type { APIContext } from "@server/types";
import ArrowDocumentTag from "../../../arrow-tags/server/models/ArrowDocumentTag";
import ArrowReviewAction from "../models/ArrowReviewAction";
import ArrowReviewRequest from "../models/ArrowReviewRequest";
import {
  presentReviewAction,
  presentReviewRequest,
} from "../presenters/arrowReview";
import { ApprovalEngine } from "../services/ApprovalEngine";
import {
  ReviewsApproveSchema,
  ReviewsCancelSchema,
  ReviewsCollectionDashboardSchema,
  ReviewsEditReviewersSchema,
  ReviewsInfoSchema,
  ReviewsListSchema,
  ReviewsReRequestSchema,
  ReviewsRequestChangesSchema,
  ReviewsRequestSchema,
  ReviewsUnlockSchema,
  type ReviewsApproveReq,
  type ReviewsCancelReq,
  type ReviewsCollectionDashboardReq,
  type ReviewsEditReviewersReq,
  type ReviewsInfoReq,
  type ReviewsListReq,
  type ReviewsReRequestReq,
  type ReviewsRequestChangesReq,
  type ReviewsRequestReq,
  type ReviewsUnlockReq,
} from "./schema";

const router = new Router();

const StaleThresholds = [30, 60, 90] as const;

type StaleMeta = {
  documentUpdatedAt: string;
  lastReviewedAt: string | null;
  daysSinceReview: number | null;
  staleThresholdDays: number;
  isStale: boolean;
  staleReason:
    | "edited_after_approval"
    | "review_expired"
    | "never_reviewed"
    | null;
};

router.post(
  "arrow.reviews.request",
  auth(),
  validate(ReviewsRequestSchema),
  transaction(),
  async (ctx: APIContext<ReviewsRequestReq>) => {
    const { user } = ctx.state.auth;
    const { transaction: tx } = ctx.state;
    const { documentId, reviewers, threshold } = ctx.input.body;

    const document = await Document.findByPk(documentId, {
      userId: user.id,
      transaction: tx,
    });
    if (!document) {
      throw httpErrors(404, "document not found", {
        id: "not_found",
        isReportable: false,
      });
    }
    authorize(user, "update", document);

    const request = await ApprovalEngine.requestReview(
      { author: user, document, reviewerIds: reviewers, threshold },
      tx
    );
    ctx.body = { data: presentReviewRequest(request, 0) };
  }
);

router.post(
  "arrow.reviews.approve",
  auth(),
  validate(ReviewsApproveSchema),
  transaction(),
  async (ctx: APIContext<ReviewsApproveReq>) => {
    const { user } = ctx.state.auth;
    const { transaction: tx } = ctx.state;
    const { requestId, comment } = ctx.input.body;

    const request = await ArrowReviewRequest.findByPk(requestId, {
      transaction: tx,
    });
    if (!request) {
      throw httpErrors(404, "review not found", {
        id: "not_found",
        isReportable: false,
      });
    }
    const document = await Document.findByPk(request.documentId, {
      transaction: tx,
    });
    if (!document) {
      throw httpErrors(404, "document not found", {
        id: "not_found",
        isReportable: false,
      });
    }

    const result = await ApprovalEngine.approve(
      { request, reviewer: user, comment, document },
      tx
    );
    const approvals = await countCurrentApprovals(requestId, tx);
    ctx.body = {
      data: {
        ...presentReviewRequest(result.request, approvals),
        transitionedToApproved: result.transitionedToApproved,
      },
    };
  }
);

router.post(
  "arrow.reviews.requestChanges",
  auth(),
  validate(ReviewsRequestChangesSchema),
  transaction(),
  async (ctx: APIContext<ReviewsRequestChangesReq>) => {
    const { user } = ctx.state.auth;
    const { transaction: tx } = ctx.state;
    const { requestId, comment } = ctx.input.body;

    const request = await ArrowReviewRequest.findByPk(requestId, {
      transaction: tx,
    });
    if (!request) {
      throw httpErrors(404, "review not found", {
        id: "not_found",
        isReportable: false,
      });
    }
    const document = await Document.findByPk(request.documentId, {
      transaction: tx,
    });
    if (!document) {
      throw httpErrors(404, "document not found", {
        id: "not_found",
        isReportable: false,
      });
    }

    const updated = await ApprovalEngine.requestChanges(
      { request, reviewer: user, comment, document },
      tx
    );
    ctx.body = { data: presentReviewRequest(updated, 0) };
  }
);

router.post(
  "arrow.reviews.cancel",
  auth(),
  validate(ReviewsCancelSchema),
  transaction(),
  async (ctx: APIContext<ReviewsCancelReq>) => {
    const { user } = ctx.state.auth;
    const { transaction: tx } = ctx.state;
    const { requestId } = ctx.input.body;

    const request = await ArrowReviewRequest.findByPk(requestId, {
      transaction: tx,
    });
    if (!request) {
      throw httpErrors(404, "review not found", {
        id: "not_found",
        isReportable: false,
      });
    }
    const updated = await ApprovalEngine.cancel({ request, actor: user }, tx);
    ctx.body = { data: presentReviewRequest(updated, 0) };
  }
);

router.post(
  "arrow.reviews.reRequest",
  auth(),
  validate(ReviewsReRequestSchema),
  transaction(),
  async (ctx: APIContext<ReviewsReRequestReq>) => {
    const { user } = ctx.state.auth;
    const { transaction: tx } = ctx.state;
    const { documentId } = ctx.input.body;

    const request = await ArrowReviewRequest.findOne({
      where: { documentId, state: "changes_requested" },
      transaction: tx,
    });
    if (!request) {
      throw httpErrors(404, "no review awaiting re-request", {
        id: "not_found",
        isReportable: false,
      });
    }
    const document = await Document.findByPk(documentId, { transaction: tx });
    if (!document) {
      throw httpErrors(404, "document not found", {
        id: "not_found",
        isReportable: false,
      });
    }
    const updated = await ApprovalEngine.reRequest(
      { request, actor: user, document },
      tx
    );
    ctx.body = { data: presentReviewRequest(updated, 0) };
  }
);

router.post(
  "arrow.reviews.editReviewers",
  auth(),
  validate(ReviewsEditReviewersSchema),
  transaction(),
  async (ctx: APIContext<ReviewsEditReviewersReq>) => {
    const { user } = ctx.state.auth;
    const { transaction: tx } = ctx.state;
    const { requestId, reviewers, threshold } = ctx.input.body;

    const request = await ArrowReviewRequest.findByPk(requestId, {
      transaction: tx,
    });
    if (!request) {
      throw httpErrors(404, "review not found", {
        id: "not_found",
        isReportable: false,
      });
    }

    const updated = await ApprovalEngine.editReviewers(
      { request, actor: user, reviewerIds: reviewers, threshold },
      tx
    );
    const approvals = await countCurrentApprovals(requestId, tx);
    ctx.body = { data: presentReviewRequest(updated, approvals) };
  }
);

router.post(
  "arrow.reviews.unlock",
  auth(),
  validate(ReviewsUnlockSchema),
  transaction(),
  async (ctx: APIContext<ReviewsUnlockReq>) => {
    const { user } = ctx.state.auth;
    const { transaction: tx } = ctx.state;
    const { documentId } = ctx.input.body;

    const request = await ArrowReviewRequest.findOne({
      where: { documentId, state: "approved" },
      order: [["completedAt", "DESC"]],
      transaction: tx,
    });
    if (!request) {
      throw httpErrors(404, "no approved review to unlock", {
        id: "not_found",
        isReportable: false,
      });
    }
    await ApprovalEngine.unlock({ request, actor: user }, tx);
    ctx.body = { success: true };
  }
);

router.post(
  "arrow.reviews.info",
  auth(),
  validate(ReviewsInfoSchema),
  async (ctx: APIContext<ReviewsInfoReq>) => {
    const { user } = ctx.state.auth;
    const { documentId } = ctx.input.body;
    const document = await Document.findByPk(documentId, { userId: user.id });
    if (!document) {
      throw httpErrors(404, "document not found", {
        id: "not_found",
        isReportable: false,
      });
    }
    authorize(user, "read", document);

    const request = await ArrowReviewRequest.findOne({
      where: {
        documentId,
        state: { [Op.in]: ["pending", "changes_requested", "approved"] },
      },
      order: [["createdAt", "DESC"]],
    });
    if (!request) {
      ctx.body = { data: null };
      return;
    }
    const approvals = await countCurrentApprovals(request.id);
    const actions = await ArrowReviewAction.findAll({
      where: { requestId: request.id },
      order: [["createdAt", "ASC"]],
    });
    const tags = await getDocumentTagNames([document.id]);
    const staleMeta = await buildStaleMeta({
      document,
      request,
      collectionName: document.collection?.name,
      tags: tags.get(document.id) ?? [],
    });

    ctx.body = {
      data: {
        ...presentReviewRequest(request, approvals),
        actions: actions.map(presentReviewAction),
        ...staleMeta,
      },
    };
  }
);

router.post(
  "arrow.reviews.collectionDashboard",
  auth(),
  validate(ReviewsCollectionDashboardSchema),
  async (ctx: APIContext<ReviewsCollectionDashboardReq>) => {
    const { user } = ctx.state.auth;
    const { collectionId } = ctx.input.body;
    const collection = await Collection.findByPk(collectionId, {
      userId: user.id,
    });

    if (!collection) {
      throw httpErrors(404, "collection not found", {
        id: "not_found",
        isReportable: false,
      });
    }
    authorize(user, "readDocument", collection);

    const documents = await Document.scope([
      "withDrafts",
      "withoutState",
    ]).findAll({
      where: {
        collectionId,
        teamId: user.teamId,
        archivedAt: null,
        deletedAt: null,
        [Op.or]: [{ publishedAt: { [Op.ne]: null } }, { createdById: user.id }],
      },
      order: [["updatedAt", "DESC"]],
      limit: 200,
    });
    const documentIds = documents.map((document) => document.id);
    const requests = await ArrowReviewRequest.findAll({
      where: { documentId: { [Op.in]: documentIds } },
      order: [["createdAt", "DESC"]],
    });
    const tagNames = await getDocumentTagNames(documentIds);
    const latestByDocumentId = new Map<string, ArrowReviewRequest>();

    for (const request of requests) {
      if (!latestByDocumentId.has(request.documentId)) {
        latestByDocumentId.set(request.documentId, request);
      }
    }

    const summaries = await Promise.all(
      documents.map(async (document) => {
        const request = latestByDocumentId.get(document.id) ?? null;
        const approvalsCount = request
          ? await countCurrentApprovals(request.id)
          : 0;
        const stale = await buildStaleMeta({
          document,
          request,
          collectionName: collection.name,
          tags: tagNames.get(document.id) ?? [],
        });

        return {
          document: presentDashboardDocument(document),
          review: request
            ? presentReviewRequest(request, approvalsCount)
            : null,
          ...stale,
        };
      })
    );

    const needingReview = summaries
      .filter(
        (item) =>
          item.review?.state === "pending" ||
          item.review?.state === "changes_requested"
      )
      .slice(0, 6);
    const recentlyApproved = summaries
      .filter((item) => item.review?.state === "approved" && !item.isStale)
      .sort(
        (a, b) =>
          new Date(b.lastReviewedAt ?? 0).getTime() -
          new Date(a.lastReviewedAt ?? 0).getTime()
      )
      .slice(0, 6);
    const stale = summaries
      .filter((item) => item.isStale)
      .sort((a, b) => (b.daysSinceReview ?? 9999) - (a.daysSinceReview ?? 9999))
      .slice(0, 6);
    const mostViewed = summaries
      .filter((item) => item.document.publishedAt)
      .sort((a, b) => b.document.popularityScore - a.document.popularityScore)
      .slice(0, 6);
    const newDrafts = summaries
      .filter((item) => !item.document.publishedAt)
      .slice(0, 6);

    ctx.body = {
      data: {
        needingReview,
        recentlyApproved,
        stale,
        mostViewed,
        newDrafts,
      },
    };
  }
);

router.post(
  "arrow.reviews.list",
  auth(),
  validate(ReviewsListSchema),
  async (ctx: APIContext<ReviewsListReq>) => {
    const { user } = ctx.state.auth;
    const { filter } = ctx.input.body;

    let requests: ArrowReviewRequest[];
    if (filter === "awaiting_me") {
      // Pending requests where I'm a required reviewer and haven't yet acted.
      const pending = await ArrowReviewRequest.findAll({
        where: { state: "pending" },
      });
      const myActions = await ArrowReviewAction.findAll({
        where: {
          userId: user.id,
          action: { [Op.in]: ["approve", "request_changes"] },
        },
        attributes: ["requestId"],
      });
      const actedRequestIds = new Set(myActions.map((a) => a.requestId));
      requests = pending.filter(
        (r) =>
          r.requiredReviewers.includes(user.id) && !actedRequestIds.has(r.id)
      );
    } else {
      // My pending specs (I'm the author).
      requests = await ArrowReviewRequest.findAll({
        where: {
          requestedById: user.id,
          state: { [Op.in]: ["pending", "changes_requested"] },
        },
      });
    }

    const items = await Promise.all(
      requests.map(async (r) => {
        const approvals = await countCurrentApprovals(r.id);
        return presentReviewRequest(r, approvals);
      })
    );
    ctx.body = { data: { reviews: items } };
  }
);

function presentDashboardDocument(document: Document) {
  return {
    id: document.id,
    title: document.title || "Untitled",
    url: document.path,
    urlId: document.urlId,
    collectionId: document.collectionId,
    updatedAt: document.updatedAt.toISOString(),
    publishedAt: document.publishedAt
      ? document.publishedAt.toISOString()
      : null,
    popularityScore: document.popularityScore ?? 0,
  };
}

async function buildStaleMeta({
  document,
  request,
  collectionName,
  tags,
}: {
  document: Document;
  request: ArrowReviewRequest | null;
  collectionName?: string;
  tags: string[];
}): Promise<StaleMeta> {
  const threshold = getStaleThresholdDays(collectionName, tags);
  const lastReviewedAt = request?.completedAt ?? null;
  const daysSinceReview = lastReviewedAt
    ? Math.max(
        0,
        Math.floor((Date.now() - lastReviewedAt.getTime()) / 86_400_000)
      )
    : null;
  const editedAfterApproval =
    request?.state === "approved" && !!lastReviewedAt
      ? await hasMeaningfulChangesSinceApproval(document, lastReviewedAt)
      : false;
  const reviewExpired =
    !!lastReviewedAt &&
    daysSinceReview !== null &&
    daysSinceReview >= threshold;
  const neverReviewed = !lastReviewedAt && !!document.publishedAt;
  const isStale = editedAfterApproval || reviewExpired || neverReviewed;

  return {
    documentUpdatedAt: document.updatedAt.toISOString(),
    lastReviewedAt: lastReviewedAt ? lastReviewedAt.toISOString() : null,
    daysSinceReview,
    staleThresholdDays: threshold,
    isStale,
    staleReason: editedAfterApproval
      ? "edited_after_approval"
      : reviewExpired
        ? "review_expired"
        : neverReviewed
          ? "never_reviewed"
          : null,
  };
}

function getStaleThresholdDays(
  collectionName: string | undefined,
  tags: string[]
) {
  const signals = [collectionName ?? "", ...tags].map((value) =>
    value.toLowerCase()
  );

  for (const threshold of StaleThresholds) {
    if (
      signals.some((signal) =>
        new RegExp(`(?:stale|review|freshness)[\\s:_-]*${threshold}\\b`).test(
          signal
        )
      )
    ) {
      return threshold;
    }
  }

  if (
    signals.some((signal) =>
      /\b(critical|runbook|onboarding|monthly|30d)\b/.test(signal)
    )
  ) {
    return 30;
  }

  if (
    signals.some((signal) =>
      /\b(reference|archive|evergreen|quarterly|90d)\b/.test(signal)
    )
  ) {
    return 90;
  }

  return 60;
}

async function hasMeaningfulChangesSinceApproval(
  document: Document,
  lastReviewedAt: Date
) {
  if (document.updatedAt.getTime() <= lastReviewedAt.getTime() + 60_000) {
    return false;
  }

  const approvedRevision = await Revision.findOne({
    where: {
      documentId: document.id,
      createdAt: { [Op.lte]: lastReviewedAt },
    },
    order: [["createdAt", "DESC"]],
  });

  if (!approvedRevision) {
    return true;
  }

  return semanticSnapshot(approvedRevision) !== semanticSnapshot(document);
}

function semanticSnapshot(model: Document | Revision) {
  return JSON.stringify({
    title: model.title ?? "",
    icon: model.icon ?? null,
    color: model.color ?? null,
    content: normalizeContent(model.content),
  });
}

function normalizeContent(value: unknown): unknown {
  if (Array.isArray(value)) {
    const normalized = value
      .map(normalizeContent)
      .filter((item) => item !== undefined);

    return normalized.length > 0 ? normalized : undefined;
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  const normalized: Record<string, unknown> = {};
  for (const key of Object.keys(value as Record<string, unknown>).sort()) {
    const next = normalizeContent((value as Record<string, unknown>)[key]);
    if (next === undefined) {
      continue;
    }
    if ((key === "attrs" || key === "marks") && isEmptyNormalized(next)) {
      continue;
    }
    if (key === "content" && isEmptyNormalized(next)) {
      continue;
    }
    normalized[key] = next;
  }

  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

function isEmptyNormalized(value: unknown) {
  if (Array.isArray(value)) {
    return value.length === 0;
  }

  return (
    !!value &&
    typeof value === "object" &&
    Object.keys(value as Record<string, unknown>).length === 0
  );
}

async function getDocumentTagNames(documentIds: string[]) {
  const map = new Map<string, string[]>();
  if (documentIds.length === 0) {
    return map;
  }

  const links = await ArrowDocumentTag.findAll({
    where: { documentId: { [Op.in]: documentIds } },
    include: [{ association: "tag" }],
  });

  for (const link of links) {
    const list = map.get(link.documentId) ?? [];
    if (link.tag?.name) {
      list.push(link.tag.name);
    }
    map.set(link.documentId, list);
  }

  return map;
}

async function countCurrentApprovals(
  requestId: string,
  transaction?: Transaction
) {
  const reRequest = await ArrowReviewAction.findOne({
    where: { requestId, action: "re_request" },
    order: [["createdAt", "DESC"]],
    transaction,
  });

  return ArrowReviewAction.count({
    where: {
      requestId,
      action: "approve",
      ...(reRequest && {
        createdAt: {
          [Op.gte]: reRequest.createdAt,
        },
      }),
    },
    transaction,
  });
}

export default router;
