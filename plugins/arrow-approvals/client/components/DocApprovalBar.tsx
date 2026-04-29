import { observer } from "mobx-react";
import { CheckmarkIcon, CloseIcon, EditIcon, WarningIcon } from "outline-icons";
import { useCallback, useEffect, useMemo, useState } from "react";
import styled, { css } from "styled-components";
import Button from "~/components/Button";
import useCurrentUser from "~/hooks/useCurrentUser";
import useStores from "~/hooks/useStores";
import { client } from "~/utils/ApiClient";
import { toast } from "sonner";

/**
 * In-context approval state bar shown at the top of a document.
 *
 * Visible to everyone with read access; the *actions* shown depend on the
 * viewer's role for this review:
 *   - Author      → Cancel (pending), Re-request (changes_requested), Unlock (approved)
 *   - Reviewer    → Approve, Request changes (only when state=pending and not yet acted)
 *   - Author with no active review → Request review (opens picker)
 *   - Bystander   → just sees the badge
 *
 * The component fails gracefully — if the API errors, it renders nothing
 * rather than break the document scene.
 */

type ReviewState = "pending" | "approved" | "changes_requested" | "cancelled";

interface ReviewAction {
  id: string;
  userId: string;
  action: string;
  body: string | null;
  createdAt: string;
}

interface ReviewInfo {
  id: string;
  documentId: string;
  requestedById: string;
  requiredReviewers: string[];
  threshold: number;
  state: ReviewState;
  approvalsCount: number;
  createdAt: string;
  completedAt: string | null;
  actions?: ReviewAction[];
}

interface Props {
  documentId: string;
}

function DocApprovalBarInner({ documentId }: Props) {
  const currentUser = useCurrentUser();
  const { users } = useStores();
  const [info, setInfo] = useState<ReviewInfo | null | "loading" | "error">("loading");
  const [pickerOpen, setPickerOpen] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await client.post("/arrow.reviews.info", { documentId });
      setInfo((res as ReviewInfo | null) ?? null);
    } catch (err) {
      // Swallow — render nothing rather than break the doc scene
      setInfo("error");
    }
  }, [documentId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleApprove = useCallback(
    async () => {
      if (!info || typeof info === "string") return;
      const comment = window.prompt("Optional approval comment:") ?? undefined;
      try {
        await client.post("/arrow.reviews.approve", { requestId: info.id, comment });
        toast.success("Approved");
        await refresh();
      } catch (err) {
        toast.error((err as { message?: string }).message ?? "Approve failed");
      }
    },
    [info, refresh]
  );

  const handleRequestChanges = useCallback(async () => {
    if (!info || typeof info === "string") return;
    const comment = window.prompt("Describe the changes needed (required):");
    if (!comment || !comment.trim()) return;
    try {
      await client.post("/arrow.reviews.requestChanges", {
        requestId: info.id, comment,
      });
      toast.success("Changes requested");
      await refresh();
    } catch (err) {
      toast.error((err as { message?: string }).message ?? "Request failed");
    }
  }, [info, refresh]);

  const handleCancel = useCallback(async () => {
    if (!info || typeof info === "string") return;
    if (!window.confirm("Cancel this review?")) return;
    try {
      await client.post("/arrow.reviews.cancel", { requestId: info.id });
      toast.success("Cancelled");
      await refresh();
    } catch (err) {
      toast.error("Cancel failed");
    }
  }, [info, refresh]);

  const handleReRequest = useCallback(async () => {
    try {
      await client.post("/arrow.reviews.reRequest", { documentId });
      toast.success("Review re-requested");
      await refresh();
    } catch (err) {
      toast.error((err as { message?: string }).message ?? "Re-request failed");
    }
  }, [documentId, refresh]);

  const handleUnlock = useCallback(async () => {
    if (!window.confirm("Unlock this document for further edits? The prior approval is preserved as historical.")) return;
    try {
      await client.post("/arrow.reviews.unlock", { documentId });
      toast.success("Unlocked — you can edit again");
      await refresh();
    } catch (err) {
      toast.error("Unlock failed");
    }
  }, [documentId, refresh]);

  const handleRequestReview = useCallback(async (reviewerIds: string[], threshold: number) => {
    try {
      await client.post("/arrow.reviews.request", {
        documentId, reviewers: reviewerIds, threshold,
      });
      toast.success("Review requested");
      setPickerOpen(false);
      await refresh();
    } catch (err) {
      toast.error((err as { message?: string }).message ?? "Failed to request review");
    }
  }, [documentId, refresh]);

  // ── derived values (must be computed before any conditional returns
  // so React hook order stays stable across renders) ──
  const reviewers = useMemo(
    () => (info && typeof info !== "string" ? info.requiredReviewers ?? [] : []),
    [info]
  );

  const waitingOn = useMemo(() => {
    if (!info || typeof info === "string") {
      return null;
    }
    if (info.state !== "pending") {
      return null;
    }
    const actedIds = new Set(
      (info.actions ?? [])
        .filter((a) => a.action === "approve" || a.action === "request_changes")
        .map((a) => a.userId)
    );
    const remaining = (info.requiredReviewers ?? []).filter(
      (id) => !actedIds.has(id)
    );
    if (remaining.length === 0) {
      return null;
    }
    const names = remaining
      .map((id) => users.get(id)?.name)
      .filter(Boolean)
      .slice(0, 3);
    if (names.length === 0) {
      return `${remaining.length} reviewer${remaining.length === 1 ? "" : "s"}`;
    }
    if (remaining.length > names.length) {
      return `${names.join(", ")} and ${remaining.length - names.length} other${remaining.length - names.length === 1 ? "" : "s"}`;
    }
    return names.join(", ");
  }, [info, users]);

  // Hide entirely on errors or while loading the very first time
  if (info === "loading" || info === "error") {
    return null;
  }

  // No active or completed review → show "Request review" button to authors only.
  if (!info) {
    return (
      <Bar $tone="neutral">
        <BarContent>
          <Badge $tone="neutral">
            <EditIcon size={14} /> Draft
          </Badge>
          <BarText>Not yet under review.</BarText>
        </BarContent>
        <BarActions>
          <Button neutral onClick={() => setPickerOpen(true)}>
            Request review
          </Button>
        </BarActions>
        {pickerOpen && (
          <ReviewerPicker
            documentId={documentId}
            currentUserId={currentUser.id}
            onCancel={() => setPickerOpen(false)}
            onSubmit={handleRequestReview}
          />
        )}
      </Bar>
    );
  }

  const isAuthor = info.requestedById === currentUser.id;
  const isReviewer = reviewers.includes(currentUser.id);
  const hasActed = (info.actions ?? []).some(
    (a) => a.userId === currentUser.id && (a.action === "approve" || a.action === "request_changes")
  );

  const tone =
    info.state === "approved" ? "success" :
    info.state === "changes_requested" ? "danger" :
    info.state === "pending" ? "warning" :
    "neutral";

  const stateLabel =
    info.state === "approved" ? "Approved" :
    info.state === "changes_requested" ? "Changes requested" :
    info.state === "pending" ? `In review · ${info.approvalsCount} of ${info.threshold}` :
    "Cancelled";

  const StateIcon =
    info.state === "approved" ? CheckmarkIcon :
    info.state === "changes_requested" ? WarningIcon :
    info.state === "pending" ? EditIcon :
    CloseIcon;

  return (
    <Bar $tone={tone}>
      <BarContent>
        <Badge $tone={tone}>
          <StateIcon size={14} /> {stateLabel}
        </Badge>
        {waitingOn && (
          <BarText>
            Waiting on <strong>{waitingOn}</strong>
          </BarText>
        )}
        {info.state === "approved" && info.completedAt && (
          <BarText>
            Approved {timeAgo(info.completedAt)}
          </BarText>
        )}
        {info.state === "changes_requested" && (
          <BarText>
            Author needs to address feedback and re-request review.
          </BarText>
        )}
      </BarContent>

      <BarActions>
        {isReviewer && !isAuthor && info.state === "pending" && !hasActed && (
          <>
            <Button onClick={handleApprove}>Approve</Button>
            <Button neutral onClick={handleRequestChanges}>Request changes</Button>
          </>
        )}
        {isAuthor && info.state === "pending" && (
          <Button neutral onClick={handleCancel}>Cancel review</Button>
        )}
        {isAuthor && info.state === "changes_requested" && (
          <>
            <Button onClick={handleReRequest}>Re-request review</Button>
            <Button neutral onClick={handleCancel}>Cancel</Button>
          </>
        )}
        {isAuthor && info.state === "approved" && (
          <Button neutral onClick={handleUnlock}>Unlock for edits</Button>
        )}
      </BarActions>
    </Bar>
  );
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const days = Math.floor(ms / 86_400_000);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
  return `${Math.floor(days / 30)} months ago`;
}

// ── reviewer picker dialog ───────────────────────────────────────────────

function ReviewerPicker({
  documentId,
  currentUserId,
  onCancel,
  onSubmit,
}: {
  documentId: string;
  currentUserId: string;
  onCancel: () => void;
  onSubmit: (reviewerIds: string[], threshold: number) => void;
}) {
  const { users } = useStores();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [threshold, setThreshold] = useState(1);
  const [query, setQuery] = useState("");

  useEffect(() => {
    void users.fetchPage({ limit: 100 });
  }, [users]);

  const list = users.orderedData.filter(
    (u) => u.id !== currentUserId && (
      !query.trim() ||
      u.name.toLowerCase().includes(query.toLowerCase()) ||
      u.email.toLowerCase().includes(query.toLowerCase())
    )
  );

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
    if (threshold > next.size) setThreshold(Math.max(1, next.size));
  };

  return (
    <PickerOverlay onClick={onCancel}>
      <PickerCard onClick={(e) => e.stopPropagation()}>
        <PickerTitle>Request review</PickerTitle>
        <PickerHint>Pick reviewers from your workspace and set how many approvals you need.</PickerHint>

        <PickerSearch
          type="search"
          placeholder="Search teammates…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />

        <PickerList>
          {list.length === 0 ? (
            <PickerEmpty>No matching teammates.</PickerEmpty>
          ) : (
            list.map((u) => (
              <PickerRow key={u.id} $selected={selected.has(u.id)} onClick={() => toggle(u.id)}>
                <PickerCheckbox $checked={selected.has(u.id)}>
                  {selected.has(u.id) && <CheckmarkIcon size={14} color="white" />}
                </PickerCheckbox>
                <PickerUser>
                  <PickerName>{u.name}</PickerName>
                  <PickerEmail>{u.email}</PickerEmail>
                </PickerUser>
              </PickerRow>
            ))
          )}
        </PickerList>

        <PickerFooter>
          <ThresholdField>
            <label htmlFor="threshold">Approvals needed</label>
            <ThresholdInput
              id="threshold"
              type="number"
              min={1}
              max={Math.max(1, selected.size)}
              value={threshold}
              onChange={(e) => setThreshold(Math.max(1, parseInt(e.target.value, 10) || 1))}
              disabled={selected.size === 0}
            />
            <span>of {selected.size}</span>
          </ThresholdField>
          <PickerActions>
            <Button neutral onClick={onCancel}>Cancel</Button>
            <Button
              disabled={selected.size === 0 || threshold > selected.size}
              onClick={() => onSubmit(Array.from(selected), threshold)}
            >
              Send for review
            </Button>
          </PickerActions>
        </PickerFooter>
      </PickerCard>
    </PickerOverlay>
  );
}

// ── styles ──────────────────────────────────────────────────────────────

type Tone = "success" | "warning" | "danger" | "neutral";

const toneColor = (theme: { brand?: Record<string, string> }, tone: Tone) => {
  switch (tone) {
    case "success": return theme.brand?.green ?? "#22c55e";
    case "warning": return theme.brand?.yellow ?? "#f59e0b";
    case "danger":  return theme.brand?.red ?? "#ef4444";
    default:        return theme.brand?.marine ?? "#0c1622";
  }
};

const Bar = styled.div<{ $tone: Tone }>`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 16px;
  border-radius: 10px;
  margin-bottom: 16px;
  background: ${(p) => toneColor(p.theme, p.$tone)}10;
  border: 1px solid ${(p) => toneColor(p.theme, p.$tone)}33;
  position: relative;
  flex-wrap: wrap;
`;

const BarContent = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  min-width: 0;
`;

const Badge = styled.span<{ $tone: Tone }>`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.01em;
  background: ${(p) => toneColor(p.theme, p.$tone)};
  color: white;
  white-space: nowrap;
`;

const BarText = styled.span`
  font-size: 13px;
  color: ${(props) => props.theme.textSecondary};

  strong {
    color: ${(props) => props.theme.text};
    font-weight: 600;
  }
`;

const BarActions = styled.div`
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
`;

// Picker

const PickerOverlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  backdrop-filter: blur(2px);
`;

const PickerCard = styled.div`
  background: ${(props) => props.theme.background};
  border: 1px solid ${(props) => props.theme.divider};
  border-radius: 12px;
  width: 460px;
  max-width: 92vw;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  padding: 20px;
  gap: 12px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4);
`;

const PickerTitle = styled.div`
  font-size: 16px;
  font-weight: 600;
  color: ${(props) => props.theme.text};
`;

const PickerHint = styled.div`
  font-size: 13px;
  color: ${(props) => props.theme.textSecondary};
  line-height: 1.4;
`;

const PickerSearch = styled.input`
  appearance: none;
  border: 1px solid ${(props) => props.theme.divider};
  background: transparent;
  color: ${(props) => props.theme.text};
  border-radius: 8px;
  padding: 8px 12px;
  font-size: 14px;
  font-family: inherit;
  &::placeholder { color: ${(props) => props.theme.textTertiary}; }
  &:focus { outline: none; border-color: ${(props) => props.theme.brand?.marine ?? props.theme.text}; }
`;

const PickerList = styled.div`
  flex: 1;
  overflow-y: auto;
  border: 1px solid ${(props) => props.theme.divider};
  border-radius: 8px;
  max-height: 320px;
`;

const PickerEmpty = styled.div`
  padding: 32px;
  text-align: center;
  color: ${(props) => props.theme.textTertiary};
  font-size: 13px;
`;

const PickerRow = styled.div<{ $selected: boolean }>`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  cursor: pointer;
  border-bottom: 1px solid ${(props) => props.theme.divider};

  &:last-child { border-bottom: none; }

  ${(p) =>
    p.$selected &&
    css`
      background: ${(props) => props.theme.backgroundSecondary};
    `}

  &:hover {
    background: ${(props) => props.theme.backgroundSecondary};
  }
`;

const PickerCheckbox = styled.div<{ $checked: boolean }>`
  width: 18px;
  height: 18px;
  border-radius: 4px;
  border: 1.5px solid ${(p) => p.$checked ? (p.theme.brand?.marine ?? "#0c1622") : p.theme.divider};
  background: ${(p) => p.$checked ? (p.theme.brand?.marine ?? "#0c1622") : "transparent"};
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: all 120ms ease;
`;

const PickerUser = styled.div`
  display: flex;
  flex-direction: column;
  min-width: 0;
`;

const PickerName = styled.span`
  font-size: 14px;
  font-weight: 500;
  color: ${(props) => props.theme.text};
`;

const PickerEmail = styled.span`
  font-size: 12px;
  color: ${(props) => props.theme.textTertiary};
`;

const PickerFooter = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding-top: 8px;
  border-top: 1px solid ${(props) => props.theme.divider};
  flex-wrap: wrap;
`;

const ThresholdField = styled.label`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: ${(props) => props.theme.textSecondary};
`;

const ThresholdInput = styled.input`
  width: 56px;
  border: 1px solid ${(props) => props.theme.divider};
  background: transparent;
  color: ${(props) => props.theme.text};
  border-radius: 6px;
  padding: 4px 8px;
  font-size: 13px;
  font-family: inherit;
  &:disabled { opacity: 0.5; }
`;

const PickerActions = styled.div`
  display: flex;
  gap: 8px;
`;

export default observer(DocApprovalBarInner);
