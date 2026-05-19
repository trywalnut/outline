import * as React from "react";
import styled from "styled-components";
import { s } from "@shared/styles";
import Tooltip from "~/components/Tooltip";
import { client } from "~/utils/ApiClient";

type ReviewState = "pending" | "approved" | "changes_requested" | "cancelled";

type ReviewInfo = {
  state: ReviewState;
  isStale?: boolean;
  staleReason?:
    | "edited_after_approval"
    | "review_expired"
    | "never_reviewed"
    | null;
  daysSinceReview?: number | null;
};

type DocumentStatus =
  | "draft"
  | "published"
  | "in_review"
  | "changes_requested"
  | "approved"
  | "stale";

type Props = {
  documentId: string;
  isDraft?: boolean;
};

const reviewCache = new Map<string, ReviewInfo | null>();
const reviewPromises = new Map<string, Promise<ReviewInfo | null>>();

export default function DocumentStatusDot({ documentId, isDraft }: Props) {
  const [review, setReview] = React.useState<ReviewInfo | null | undefined>(
    () => reviewCache.get(documentId)
  );

  React.useEffect(() => {
    if (isDraft || review !== undefined) {
      return;
    }

    let mounted = true;
    const promise = getReviewInfo(documentId);

    void promise.then((info) => {
      if (mounted) {
        setReview(info);
      }
    });

    return () => {
      mounted = false;
    };
  }, [documentId, isDraft, review]);

  const status = getDocumentStatus(isDraft, review);
  const label = getStatusLabel(status);

  return (
    <Tooltip content={label}>
      <Dot aria-label={label} $status={status} />
    </Tooltip>
  );
}

async function getReviewInfo(documentId: string) {
  const cached = reviewCache.get(documentId);
  if (cached !== undefined) {
    return cached;
  }

  const existingPromise = reviewPromises.get(documentId);
  if (existingPromise) {
    return existingPromise;
  }

  const promise = client
    .post("/arrow.reviews.info", { documentId })
    .then((res) => {
      const data = (res as { data?: ReviewInfo | null } | null)?.data ?? null;
      reviewCache.set(documentId, data);
      reviewPromises.delete(documentId);
      return data;
    })
    .catch(() => {
      reviewCache.set(documentId, null);
      reviewPromises.delete(documentId);
      return null;
    });

  reviewPromises.set(documentId, promise);
  return promise;
}

function getDocumentStatus(
  isDraft: boolean | undefined,
  review: ReviewInfo | null | undefined
): DocumentStatus {
  if (isDraft) {
    return "draft";
  }

  if (review?.isStale) {
    return "stale";
  }

  if (review?.state === "approved") {
    return "approved";
  }

  if (review?.state === "changes_requested") {
    return "changes_requested";
  }

  if (review?.state === "pending") {
    return "in_review";
  }

  return "published";
}

function getStatusLabel(status: DocumentStatus) {
  switch (status) {
    case "draft":
      return "Draft";
    case "published":
      return "Published";
    case "in_review":
      return "In review";
    case "changes_requested":
      return "Needs changes";
    case "approved":
      return "Approved";
    case "stale":
      return "Stale review";
  }
}

const Dot = styled.span<{ $status: DocumentStatus }>`
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex: 0 0 auto;
  background: ${(props) => {
    switch (props.$status) {
      case "draft":
        return props.theme.yellow;
      case "published":
        return props.theme.textTertiary;
      case "in_review":
        return props.theme.info;
      case "changes_requested":
        return props.theme.danger;
      case "approved":
        return props.theme.success;
      case "stale":
        return props.theme.warning;
    }
  }};
  box-shadow: 0 0 0 2px ${s("sidebarBackground")};
`;
