import ArrowReviewAction from "../models/ArrowReviewAction";
import ArrowReviewRequest from "../models/ArrowReviewRequest";

export interface PresentedReviewAction {
  id: string;
  userId: string;
  action: string;
  body: string | null;
  revisionId: string | null;
  createdAt: string;
}

export interface PresentedReviewRequest {
  id: string;
  documentId: string;
  requestedById: string;
  requiredReviewers: string[];
  threshold: number;
  state: string;
  approvalsCount: number;
  revisionId: string | null;
  createdAt: string;
  completedAt: string | null;
}

/**
 * Format a review request for API responses.
 *
 * @param request the review request model
 * @param approvalsCount precomputed number of `approve` actions on this request
 * @returns the wire-format review request.
 */
export function presentReviewRequest(
  request: ArrowReviewRequest,
  approvalsCount: number
): PresentedReviewRequest {
  return {
    id: request.id,
    documentId: request.documentId,
    requestedById: request.requestedById,
    requiredReviewers: request.requiredReviewers,
    threshold: request.threshold,
    state: request.state,
    approvalsCount,
    revisionId: request.revisionId,
    createdAt: request.createdAt.toISOString(),
    completedAt: request.completedAt ? request.completedAt.toISOString() : null,
  };
}

/**
 * Format a review action (audit log entry) for API responses.
 */
export function presentReviewAction(action: ArrowReviewAction): PresentedReviewAction {
  return {
    id: action.id,
    userId: action.userId,
    action: action.action,
    body: action.body,
    revisionId: action.revisionId,
    createdAt: action.createdAt.toISOString(),
  };
}
