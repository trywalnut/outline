import Router from "koa-router";
import { Op } from "sequelize";
import httpErrors from "http-errors";
import { Document } from "@server/models";
import auth from "@server/middlewares/authentication";
import { transaction } from "@server/middlewares/transaction";
import validate from "@server/middlewares/validate";
import { authorize } from "@server/policies";
import type { APIContext } from "@server/types";
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
  ReviewsEditReviewersSchema,
  ReviewsInfoSchema,
  ReviewsListSchema,
  ReviewsReRequestSchema,
  ReviewsRequestChangesSchema,
  ReviewsRequestSchema,
  ReviewsUnlockSchema,
  type ReviewsApproveReq,
  type ReviewsCancelReq,
  type ReviewsEditReviewersReq,
  type ReviewsInfoReq,
  type ReviewsListReq,
  type ReviewsReRequestReq,
  type ReviewsRequestChangesReq,
  type ReviewsRequestReq,
  type ReviewsUnlockReq,
} from "./schema";

const router = new Router();

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

    const request = await ArrowReviewRequest.findByPk(requestId, { transaction: tx });
    if (!request) {
      throw httpErrors(404, "review not found", {
        id: "not_found",
        isReportable: false,
      });
    }
    const document = await Document.findByPk(request.documentId, { transaction: tx });
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
    const approvals = await ArrowReviewAction.count({
      where: { requestId, action: "approve" },
      transaction: tx,
    });
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

    const request = await ArrowReviewRequest.findByPk(requestId, { transaction: tx });
    if (!request) {
      throw httpErrors(404, "review not found", {
        id: "not_found",
        isReportable: false,
      });
    }
    const document = await Document.findByPk(request.documentId, { transaction: tx });
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

    const request = await ArrowReviewRequest.findByPk(requestId, { transaction: tx });
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

    const request = await ArrowReviewRequest.findByPk(requestId, { transaction: tx });
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
    const approvals = await ArrowReviewAction.count({
      where: { requestId, action: "approve" },
      transaction: tx,
    });
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
    const { documentId } = ctx.input.body;
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
    const approvals = await ArrowReviewAction.count({
      where: { requestId: request.id, action: "approve" },
    });
    const actions = await ArrowReviewAction.findAll({
      where: { requestId: request.id },
      order: [["createdAt", "ASC"]],
    });
    ctx.body = {
      data: {
        ...presentReviewRequest(request, approvals),
        actions: actions.map(presentReviewAction),
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
        const approvals = await ArrowReviewAction.count({
          where: { requestId: r.id, action: "approve" },
        });
        return presentReviewRequest(r, approvals);
      })
    );
    ctx.body = { data: { reviews: items } };
  }
);

export default router;
