import { observer } from "mobx-react";
import { useCallback, useEffect, useState } from "react";
import { useHistory } from "react-router-dom";
import styled from "styled-components";
import Button from "~/components/Button";
import Heading from "~/components/Heading";
import Scene from "~/components/Scene";
import Tabs from "~/components/Tabs";
import Tab from "~/components/Tab";
import Text from "~/components/Text";
import { client } from "~/utils/ApiClient";
import { toast } from "sonner";

/**
 * arrow-approvals settings page — the reviewer inbox.
 *
 * Two tabs:
 *   - "Awaiting my review": reviews where I'm a required reviewer and
 *     haven't acted. Each row shows the doc title, author, age, and
 *     buttons to Approve / Request changes (with a comment prompt).
 *   - "My pending specs": reviews I authored that are still pending or
 *     in changes_requested. I can cancel them or re-request review.
 *
 * No MobX store yet; direct ApiClient calls. Polls every 30s when the
 * page is open so the inbox stays fresh.
 */

interface ReviewRequest {
  id: string;
  documentId: string;
  requestedById: string;
  requiredReviewers: string[];
  threshold: number;
  state: "pending" | "approved" | "changes_requested" | "cancelled";
  approvalsCount: number;
  createdAt: string;
}

interface DocSummary {
  id: string;
  title: string;
  urlId: string;
  url?: string;
}

type DocumentsInfoResponse = {
  data?: DocSummary | { document?: DocSummary };
};

type Filter = "awaiting_me" | "my_pending";

function ArrowApprovalsSettings() {
  const history = useHistory();
  const [filter, setFilter] = useState<Filter>("awaiting_me");
  const [reviews, setReviews] = useState<ReviewRequest[]>([]);
  const [docs, setDocs] = useState<Record<string, DocSummary>>({});
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await client.post("/arrow.reviews.list", { filter });
      const data = (res as { data?: { reviews?: ReviewRequest[] } } | null)?.data;
      const list = data?.reviews ?? [];
      setReviews(list);

      // Hydrate doc titles in parallel — avoids a server-side join.
      const docMap: Record<string, DocSummary> = {};
      await Promise.all(
        list.map(async (r) => {
          try {
            const docRes = await client.post("/documents.info", { id: r.documentId });
            const docData = getDocumentFromInfoResponse(
              docRes as DocumentsInfoResponse | null
            );
            if (docData) {
              docMap[r.documentId] = docData;
            }
          } catch {
            // ignore — doc may have been archived; row will still render with id
          }
        })
      );
      setDocs(docMap);
    } catch (_err) {
      toast.error("Failed to load reviews");
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    void refresh();
    const intv = setInterval(() => void refresh(), 30_000);
    return () => clearInterval(intv);
  }, [refresh]);

  const handleApprove = useCallback(
    async (review: ReviewRequest) => {
      const comment = window.prompt("Optional approval comment:") ?? undefined;
      try {
        await client.post("/arrow.reviews.approve", {
          requestId: review.id,
          comment,
        });
        toast.success("Approved");
        await refresh();
      } catch (err) {
        toast.error((err as { message?: string }).message ?? "Approve failed");
      }
    },
    [refresh]
  );

  const handleRequestChanges = useCallback(
    async (review: ReviewRequest) => {
      const comment = window.prompt("Describe the changes needed (required):");
      if (!comment || !comment.trim()) {
        return;
      }
      try {
        await client.post("/arrow.reviews.requestChanges", {
          requestId: review.id,
          comment,
        });
        toast.success("Changes requested");
        await refresh();
      } catch (err) {
        toast.error((err as { message?: string }).message ?? "Request failed");
      }
    },
    [refresh]
  );

  const handleCancel = useCallback(
    async (review: ReviewRequest) => {
      if (!window.confirm("Cancel this review?")) {
        return;
      }
      try {
        await client.post("/arrow.reviews.cancel", { requestId: review.id });
        toast.success("Cancelled");
        await refresh();
      } catch (_err) {
        toast.error("Cancel failed");
      }
    },
    [refresh]
  );

  const handleReRequest = useCallback(
    async (review: ReviewRequest) => {
      try {
        await client.post("/arrow.reviews.reRequest", {
          documentId: review.documentId,
        });
        toast.success("Review re-requested");
        await refresh();
      } catch (err) {
        toast.error((err as { message?: string }).message ?? "Re-request failed");
      }
    },
    [refresh]
  );

  const getDocumentPath = useCallback((doc?: DocSummary) => {
    if (!doc) {
      return;
    }

    return doc.url ?? `/doc/${doc.urlId}`;
  }, []);

  const openDocument = useCallback(
    (doc?: DocSummary) => {
      const path = getDocumentPath(doc);
      if (path) {
        history.push(path);
      }
    },
    [getDocumentPath, history]
  );

  return (
    <Scene title="Reviews">
      <Heading>Reviews</Heading>
      <Text as="p" type="secondary">
        Track specs that need your approval and ones you've authored.
      </Text>

      <Tabs>
        <Tab onClick={() => setFilter("awaiting_me")} active={filter === "awaiting_me"}>
          Awaiting my review
        </Tab>
        <Tab onClick={() => setFilter("my_pending")} active={filter === "my_pending"}>
          My pending specs
        </Tab>
      </Tabs>

      {loading ? (
        <Text type="secondary">Loading…</Text>
      ) : reviews.length === 0 ? (
        <EmptyState>
          {filter === "awaiting_me"
            ? "Nothing waiting on you. ✨"
            : "You don't have any pending review requests right now."}
        </EmptyState>
      ) : (
        <ReviewList>
          {reviews.map((review) => {
            const doc = docs[review.documentId];
            const ageMs = Date.now() - new Date(review.createdAt).getTime();
            const days = Math.floor(ageMs / (1000 * 60 * 60 * 24));
            const ageStr = days === 0 ? "today" : `${days}d ago`;
            const documentPath = getDocumentPath(doc);
            return (
              <ReviewCard
                key={review.id}
                role={documentPath ? "link" : undefined}
                tabIndex={documentPath ? 0 : undefined}
                onClick={() => openDocument(doc)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    openDocument(doc);
                  }
                }}
                $clickable={!!documentPath}
              >
                <Title>
                  {doc ? (
                    <DocumentTitle>{doc.title || "Untitled"}</DocumentTitle>
                  ) : (
                    <em>(document unavailable)</em>
                  )}
                  <StateBadge data-state={review.state}>{review.state}</StateBadge>
                </Title>
                <Meta>
                  Requested {ageStr} • {review.approvalsCount} of {review.threshold} approvals
                </Meta>
                {filter === "awaiting_me" ? (
                  <Actions
                    onClick={(event) => event.stopPropagation()}
                    onKeyDown={(event) => event.stopPropagation()}
                  >
                    <Button onClick={() => handleApprove(review)}>Approve</Button>
                    <Button neutral onClick={() => handleRequestChanges(review)}>
                      Request changes
                    </Button>
                  </Actions>
                ) : (
                  <Actions
                    onClick={(event) => event.stopPropagation()}
                    onKeyDown={(event) => event.stopPropagation()}
                  >
                    {review.state === "changes_requested" && (
                      <Button onClick={() => handleReRequest(review)}>
                        Re-request review
                      </Button>
                    )}
                    <Button neutral onClick={() => handleCancel(review)}>
                      Cancel
                    </Button>
                  </Actions>
                )}
              </ReviewCard>
            );
          })}
        </ReviewList>
      )}
    </Scene>
  );
}

function getDocumentFromInfoResponse(
  res: DocumentsInfoResponse | null
): DocSummary | undefined {
  const data = res?.data;

  if (!data) {
    return undefined;
  }

  if ("document" in data) {
    return data.document;
  }

  return "id" in data ? data : undefined;
}

const EmptyState = styled.div`
  padding: 32px;
  text-align: center;
  color: ${(props) => props.theme.textSecondary};
`;

const ReviewList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 16px;
`;

const ReviewCard = styled.div<{ $clickable: boolean }>`
  padding: 16px;
  border-radius: 8px;
  background: ${(props) => props.theme.backgroundSecondary};
  display: flex;
  flex-direction: column;
  gap: 8px;
  cursor: ${(props) => (props.$clickable ? "pointer" : "default")};
  transition:
    background 120ms ease,
    box-shadow 120ms ease,
    transform 120ms ease;

  &:hover {
    background: ${(props) =>
      props.$clickable ? props.theme.backgroundTertiary : props.theme.backgroundSecondary};
  }

  &:focus-visible {
    outline: 2px solid ${(props) => props.theme.accent};
    outline-offset: 2px;
  }
`;

const Title = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  font-weight: 600;
`;

const DocumentTitle = styled.span`
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: ${(props) => props.theme.text};
`;

const Meta = styled.div`
  font-size: 13px;
  color: ${(props) => props.theme.textSecondary};
`;

const Actions = styled.div`
  display: flex;
  gap: 8px;
  margin-top: 4px;
`;

const StateBadge = styled.span`
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  padding: 2px 8px;
  border-radius: 12px;
  font-weight: 600;

  &[data-state="pending"] {
    background: #fff3cd;
    color: #856404;
  }
  &[data-state="approved"] {
    background: #d4edda;
    color: #155724;
  }
  &[data-state="changes_requested"] {
    background: #f8d7da;
    color: #721c24;
  }
  &[data-state="cancelled"] {
    background: #e2e3e5;
    color: #383d41;
  }
`;

export default observer(ArrowApprovalsSettings);
