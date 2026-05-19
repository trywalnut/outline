import { observer } from "mobx-react";
import {
  CheckmarkIcon,
  ClockIcon,
  CloseIcon,
  CommentIcon,
  EditIcon,
  HistoryIcon,
  PlusIcon,
  UserIcon,
  WarningIcon,
} from "outline-icons";
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
  documentUpdatedAt?: string;
  lastReviewedAt?: string | null;
  daysSinceReview?: number | null;
  staleThresholdDays?: number;
  isStale?: boolean;
  staleReason?:
    | "edited_after_approval"
    | "review_expired"
    | "never_reviewed"
    | null;
}

interface Props {
  documentId: string;
}

function DocApprovalBarInner({ documentId }: Props) {
  const currentUser = useCurrentUser();
  const { users } = useStores();
  const [info, setInfo] = useState<ReviewInfo | null | "loading" | "error">(
    "loading"
  );
  const [pickerOpen, setPickerOpen] = useState(false);
  const [editPickerOpen, setEditPickerOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await client.post("/arrow.reviews.info", { documentId });
      const data = (res as { data?: ReviewInfo | null } | null)?.data ?? null;
      setInfo(data);
    } catch (_err) {
      // Swallow — render nothing rather than break the doc scene
      setInfo("error");
    }
  }, [documentId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleApprove = useCallback(async () => {
    if (!info || typeof info === "string") {
      return;
    }
    const comment = window.prompt("Optional approval comment:") ?? undefined;
    try {
      await client.post("/arrow.reviews.approve", {
        requestId: info.id,
        comment,
      });
      toast.success("Approved");
      await refresh();
    } catch (err) {
      toast.error((err as { message?: string }).message ?? "Approve failed");
    }
  }, [info, refresh]);

  const handleRequestChanges = useCallback(async () => {
    if (!info || typeof info === "string") {
      return;
    }
    const comment = window.prompt("Describe the changes needed (required):");
    if (!comment || !comment.trim()) {
      return;
    }
    try {
      await client.post("/arrow.reviews.requestChanges", {
        requestId: info.id,
        comment,
      });
      toast.success("Changes requested");
      await refresh();
    } catch (err) {
      toast.error((err as { message?: string }).message ?? "Request failed");
    }
  }, [info, refresh]);

  const handleCancel = useCallback(async () => {
    if (!info || typeof info === "string") {
      return;
    }
    if (!window.confirm("Cancel this review?")) {
      return;
    }
    try {
      await client.post("/arrow.reviews.cancel", { requestId: info.id });
      toast.success("Cancelled");
      await refresh();
    } catch (_err) {
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
    if (
      !window.confirm(
        "Unlock this document for further edits? The prior approval is preserved as historical."
      )
    ) {
      return;
    }
    try {
      await client.post("/arrow.reviews.unlock", { documentId });
      toast.success("Unlocked — you can edit again");
      await refresh();
    } catch (_err) {
      toast.error("Unlock failed");
    }
  }, [documentId, refresh]);

  const handleRequestReview = useCallback(
    async (reviewerIds: string[], threshold: number) => {
      try {
        await client.post("/arrow.reviews.request", {
          documentId,
          reviewers: reviewerIds,
          threshold,
        });
        toast.success("Review requested");
        setPickerOpen(false);
        await refresh();
      } catch (err) {
        toast.error(
          (err as { message?: string }).message ?? "Failed to request review"
        );
      }
    },
    [documentId, refresh]
  );

  const handleEditReviewers = useCallback(
    async (reviewerIds: string[], threshold: number) => {
      if (!info || typeof info === "string") {
        return;
      }
      try {
        await client.post("/arrow.reviews.editReviewers", {
          requestId: info.id,
          reviewers: reviewerIds,
          threshold,
        });
        toast.success("Reviewers updated");
        setEditPickerOpen(false);
        await refresh();
      } catch (err) {
        toast.error(
          (err as { message?: string }).message ?? "Failed to update reviewers"
        );
      }
    },
    [info, refresh]
  );

  // ── derived values (must be computed before any conditional returns
  // so React hook order stays stable across renders) ──
  const reviewers = useMemo(
    () =>
      info && typeof info !== "string" ? (info.requiredReviewers ?? []) : [],
    [info]
  );

  const waitingOn = useMemo(() => {
    if (!info || typeof info === "string") {
      return null;
    }
    if (info.state !== "pending") {
      return null;
    }
    const actions = currentRoundActions(info.actions ?? []);
    const actedIds = new Set(
      actions
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
      <BarWrap>
        <Bar $tone="neutral">
          <BarContent>
            <Badge $tone="neutral">
              <EditIcon size={14} /> Draft
            </Badge>
            <IconText>
              <ClockIcon size={14} />
              Not yet under review
            </IconText>
          </BarContent>
          <BarActions>
            <ActionButton type="button" onClick={() => setPickerOpen(true)}>
              <PlusIcon size={14} />
              Request review
            </ActionButton>
          </BarActions>
        </Bar>
        {pickerOpen && (
          <ReviewerPicker
            documentId={documentId}
            currentUserId={currentUser.id}
            onCancel={() => setPickerOpen(false)}
            onSubmit={handleRequestReview}
          />
        )}
      </BarWrap>
    );
  }

  const isAuthor = info.requestedById === currentUser.id;
  const isReviewer = reviewers.includes(currentUser.id);
  const hasActed = (info.actions ?? []).some(
    (a) =>
      a.userId === currentUser.id &&
      (a.action === "approve" || a.action === "request_changes")
  );

  const tone = info.isStale
    ? "warning"
    : info.state === "approved"
      ? "success"
      : info.state === "changes_requested"
        ? "danger"
        : info.state === "pending"
          ? "warning"
          : "neutral";

  const stateLabel = info.isStale
    ? "Approved, stale"
    : info.state === "approved"
      ? "Approved"
      : info.state === "changes_requested"
        ? "Changes requested"
        : info.state === "pending"
          ? `In review · ${info.approvalsCount} of ${info.threshold}`
          : "Cancelled";

  const StateIcon = info.isStale
    ? WarningIcon
    : info.state === "approved"
      ? CheckmarkIcon
      : info.state === "changes_requested"
        ? WarningIcon
        : info.state === "pending"
          ? EditIcon
          : CloseIcon;

  const hasHistory = (info.actions ?? []).length > 0;
  const canEditReviewers =
    isAuthor &&
    (info.state === "pending" || info.state === "changes_requested");

  return (
    <BarWrap>
      <Bar $tone={tone}>
        <BarContent>
          <Badge $tone={tone}>
            <StateIcon size={14} /> {stateLabel}
          </Badge>
          {waitingOn && (
            <IconText>
              <UserIcon size={14} />
              Waiting on <strong>{waitingOn}</strong>
            </IconText>
          )}
          {info.lastReviewedAt && (
            <IconText>
              <ClockIcon size={14} />
              Last reviewed {timeAgo(info.lastReviewedAt)}
            </IconText>
          )}
          {info.isStale && (
            <IconText>
              <WarningIcon size={14} />
              {staleCopy(info)}
            </IconText>
          )}
          {info.state === "changes_requested" && (
            <IconText>
              <CommentIcon size={14} />
              Author needs to address feedback and re-request review.
            </IconText>
          )}
          {info.state !== "pending" && (
            <IconText>
              <UserIcon size={14} />
              {info.approvalsCount} of {info.threshold} approvals
            </IconText>
          )}
          {canEditReviewers && (
            <ActionButton type="button" onClick={() => setEditPickerOpen(true)}>
              <UserIcon size={14} />
              Edit reviewers
            </ActionButton>
          )}
          <ActionButton type="button" onClick={() => setDetailsOpen((o) => !o)}>
            <HistoryIcon size={14} />
            {detailsOpen ? "Hide details" : "Review details"}
          </ActionButton>
        </BarContent>

        <BarActions>
          {isReviewer && !isAuthor && info.state === "pending" && !hasActed && (
            <>
              <ActionButton type="button" $strong onClick={handleApprove}>
                <CheckmarkIcon size={14} />
                Approve
              </ActionButton>
              <ActionButton type="button" onClick={handleRequestChanges}>
                <WarningIcon size={14} />
                Request changes
              </ActionButton>
            </>
          )}
          {isAuthor && info.state === "pending" && (
            <ActionButton type="button" onClick={handleCancel}>
              <CloseIcon size={14} />
              Cancel review
            </ActionButton>
          )}
          {isAuthor && info.state === "changes_requested" && (
            <>
              <ActionButton type="button" $strong onClick={handleReRequest}>
                <PlusIcon size={14} />
                Re-request review
              </ActionButton>
              <ActionButton type="button" onClick={handleCancel}>
                <CloseIcon size={14} />
                Cancel
              </ActionButton>
            </>
          )}
          {isAuthor && info.state === "approved" && (
            <ActionButton type="button" onClick={handleUnlock}>
              <EditIcon size={14} />
              Unlock for edits
            </ActionButton>
          )}
        </BarActions>
      </Bar>

      {detailsOpen && (
        <HistoryPanel>
          <PanelHeader>
            <HistoryTitle>
              <HistoryIcon size={13} />
              Review details
            </HistoryTitle>
            <PanelMeta>
              {info.approvalsCount} of {info.threshold} approvals required
            </PanelMeta>
          </PanelHeader>
          <PanelGrid>
            <PanelSection>
              <PanelLabel>Current state</PanelLabel>
              <StateSummary>
                <Badge $tone={tone}>
                  <StateIcon size={14} /> {stateLabel}
                </Badge>
                <SummaryText>
                  {info.lastReviewedAt
                    ? `Last reviewed ${timeAgo(info.lastReviewedAt)}`
                    : "No completed review yet"}
                </SummaryText>
                {info.isStale && (
                  <StaleNote>
                    <WarningIcon size={14} />
                    {staleCopy(info)}
                  </StaleNote>
                )}
              </StateSummary>
            </PanelSection>
            <PanelSection>
              <PanelLabel>Requested reviewers</PanelLabel>
              <ReviewerRows>
                {reviewers.map((id) => {
                  const status = reviewerStatus(
                    id,
                    currentRoundActions(info.actions ?? [])
                  );
                  const StatusIcon = actionIcon(status.action ?? "pending");
                  return (
                    <ReviewerRow key={id}>
                      <ReviewerIdentity>
                        <ReviewerDot data-action={status.action ?? "pending"}>
                          <StatusIcon size={11} />
                        </ReviewerDot>
                        <span>{users.get(id)?.name ?? "Unknown reviewer"}</span>
                      </ReviewerIdentity>
                      <ReviewerState>{status.label}</ReviewerState>
                    </ReviewerRow>
                  );
                })}
              </ReviewerRows>
            </PanelSection>
          </PanelGrid>

          {hasHistory && (
            <>
              <PanelLabel>Activity</PanelLabel>
              <HistoryList>
                {(info.actions ?? []).map((a) => {
                  const userName = users.get(a.userId)?.name ?? "someone";
                  const verb = actionVerb(a.action);
                  const ActionIcon = actionIcon(a.action);
                  return (
                    <HistoryRow key={a.id}>
                      <HistoryDot data-action={a.action}>
                        <ActionIcon size={12} />
                      </HistoryDot>
                      <HistoryBody>
                        <HistoryHeading>
                          <strong>{userName}</strong> {verb} ·{" "}
                          <HistoryTime>{timeAgo(a.createdAt)}</HistoryTime>
                        </HistoryHeading>
                        {a.body && <HistoryComment>{a.body}</HistoryComment>}
                      </HistoryBody>
                    </HistoryRow>
                  );
                })}
              </HistoryList>
            </>
          )}
        </HistoryPanel>
      )}

      {editPickerOpen && (
        <ReviewerPicker
          documentId={documentId}
          currentUserId={currentUser.id}
          mode="edit"
          initialSelected={info.requiredReviewers ?? []}
          initialThreshold={info.threshold}
          onCancel={() => setEditPickerOpen(false)}
          onSubmit={handleEditReviewers}
        />
      )}
    </BarWrap>
  );
}

function actionVerb(action: string): string {
  switch (action) {
    case "approve":
      return "approved";
    case "request_changes":
      return "requested changes";
    case "cancel":
      return "cancelled the review";
    case "re_request":
      return "re-requested review";
    case "unlock":
      return "unlocked the document";
    default:
      return action;
  }
}

function actionIcon(action: string) {
  switch (action) {
    case "approve":
      return CheckmarkIcon;
    case "request_changes":
      return WarningIcon;
    case "pending":
      return ClockIcon;
    case "cancel":
      return CloseIcon;
    case "re_request":
      return PlusIcon;
    case "unlock":
      return EditIcon;
    default:
      return HistoryIcon;
  }
}

function currentRoundActions(actions: ReviewAction[]) {
  const reRequest = [...actions]
    .reverse()
    .find((action) => action.action === "re_request");

  if (!reRequest) {
    return actions;
  }

  const roundStartedAt = new Date(reRequest.createdAt).getTime();
  return actions.filter(
    (action) => new Date(action.createdAt).getTime() >= roundStartedAt
  );
}

function reviewerStatus(userId: string, actions: ReviewAction[]) {
  const action = [...actions]
    .reverse()
    .find(
      (a) =>
        a.userId === userId &&
        (a.action === "approve" || a.action === "request_changes")
    );

  if (action?.action === "approve") {
    return {
      action: "approve",
      label: `Approved ${timeAgo(action.createdAt)}`,
    };
  }

  if (action?.action === "request_changes") {
    return {
      action: "request_changes",
      label: `Requested changes ${timeAgo(action.createdAt)}`,
    };
  }

  return { action: null, label: "Waiting" };
}

function staleCopy(info: ReviewInfo) {
  if (info.staleReason === "edited_after_approval") {
    return "Changed since approval";
  }
  if (
    info.staleReason === "review_expired" &&
    typeof info.daysSinceReview === "number"
  ) {
    return `Review older than ${info.staleThresholdDays ?? 60} days`;
  }
  if (info.staleReason === "never_reviewed") {
    return "Never reviewed";
  }
  return "Review may be stale";
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const days = Math.floor(ms / 86_400_000);
  if (days === 0) {
    return "today";
  }
  if (days === 1) {
    return "yesterday";
  }
  if (days < 7) {
    return `${days} days ago`;
  }
  if (days < 30) {
    return `${Math.floor(days / 7)} weeks ago`;
  }
  return `${Math.floor(days / 30)} months ago`;
}

// ── reviewer picker dialog ───────────────────────────────────────────────

function ReviewerPicker({
  documentId: _documentId,
  currentUserId,
  mode = "request",
  initialSelected,
  initialThreshold,
  onCancel,
  onSubmit,
}: {
  documentId: string;
  currentUserId: string;
  mode?: "request" | "edit";
  initialSelected?: string[];
  initialThreshold?: number;
  onCancel: () => void;
  onSubmit: (reviewerIds: string[], threshold: number) => void;
}) {
  const { users } = useStores();
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(initialSelected ?? [])
  );
  const [threshold, setThreshold] = useState(initialThreshold ?? 1);
  const [query, setQuery] = useState("");

  useEffect(() => {
    void users.fetchPage({ limit: 100 });
  }, [users]);

  const list = users.orderedData.filter(
    (u) =>
      u.id !== currentUserId &&
      (!query.trim() ||
        u.name.toLowerCase().includes(query.toLowerCase()) ||
        u.email.toLowerCase().includes(query.toLowerCase()))
  );

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelected(next);
    if (threshold > next.size) {
      setThreshold(Math.max(1, next.size));
    }
  };

  return (
    <PickerOverlay onClick={onCancel}>
      <PickerCard onClick={(e) => e.stopPropagation()}>
        <PickerTitle>
          {mode === "edit" ? "Edit reviewers" : "Request review"}
        </PickerTitle>
        <PickerHint>
          {mode === "edit"
            ? "Add or remove reviewers. Approvals from kept reviewers stay; approvals from removed reviewers no longer count."
            : "Pick reviewers from your workspace and set how many approvals you need."}
        </PickerHint>

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
              <PickerRow
                key={u.id}
                $selected={selected.has(u.id)}
                onClick={() => toggle(u.id)}
              >
                <PickerCheckbox $checked={selected.has(u.id)}>
                  {selected.has(u.id) && (
                    <CheckmarkIcon size={14} color="white" />
                  )}
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
              onChange={(e) =>
                setThreshold(Math.max(1, parseInt(e.target.value, 10) || 1))
              }
              disabled={selected.size === 0}
            />
            <span>of {selected.size}</span>
          </ThresholdField>
          <PickerActions>
            <Button neutral onClick={onCancel}>
              Cancel
            </Button>
            <Button
              disabled={selected.size === 0 || threshold > selected.size}
              onClick={() => onSubmit(Array.from(selected), threshold)}
            >
              {mode === "edit" ? "Save changes" : "Send for review"}
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
    case "success":
      return theme.brand?.green ?? "#22c55e";
    case "warning":
      return theme.brand?.yellow ?? "#f59e0b";
    case "danger":
      return theme.brand?.red ?? "#ef4444";
    default:
      return theme.brand?.marine ?? "#0c1622";
  }
};

const BarWrap = styled.div`
  margin-bottom: 12px;
`;

const Bar = styled.div<{ $tone: Tone }>`
  display: inline-flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  max-width: 100%;
  padding: 5px 6px;
  border-radius: 8px;
  background: ${(props) => props.theme.background};
  border: 1px solid ${(p) => toneColor(p.theme, p.$tone)}2e;
  position: relative;
  flex-wrap: wrap;
  box-shadow: 0 1px 0 rgba(0, 0, 0, 0.03);
`;

const ActionButton = styled.button<{ $strong?: boolean }>`
  border: 1px solid ${(props) => props.theme.divider};
  background: ${(props) =>
    props.$strong ? props.theme.backgroundSecondary : "transparent"};
  border-radius: 6px;
  color: ${(props) => props.theme.textSecondary};
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-family: inherit;
  font-weight: 500;
  font-size: 12px;
  height: 28px;
  padding: 0 8px;
  cursor: pointer;
  transition:
    background 100ms ease,
    border-color 100ms ease,
    color 100ms ease;
  white-space: nowrap;

  svg {
    flex-shrink: 0;
  }

  &:hover {
    color: ${(props) => props.theme.text};
    background: ${(props) => props.theme.backgroundSecondary};
    border-color: ${(props) => props.theme.textTertiary};
  }
`;

const HistoryPanel = styled.div`
  margin-top: 8px;
  width: min(780px, 100%);
  padding: 12px;
  border-radius: 8px;
  border: 1px solid ${(props) => props.theme.divider};
  background: ${(props) => props.theme.background};
`;

const PanelHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
`;

const HistoryTitle = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: ${(props) => props.theme.textTertiary};
`;

const PanelMeta = styled.span`
  color: ${(props) => props.theme.textTertiary};
  font-size: 12px;
`;

const PanelGrid = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(220px, 1fr);
  gap: 12px;
  margin-bottom: 12px;

  @media (max-width: 720px) {
    grid-template-columns: 1fr;
  }
`;

const PanelSection = styled.div`
  border: 1px solid ${(props) => props.theme.divider};
  background: ${(props) => props.theme.backgroundSecondary};
  border-radius: 8px;
  padding: 10px;
`;

const PanelLabel = styled.div`
  color: ${(props) => props.theme.textTertiary};
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  margin-bottom: 8px;
`;

const StateSummary = styled.div`
  display: flex;
  align-items: flex-start;
  flex-direction: column;
  gap: 8px;
`;

const SummaryText = styled.span`
  color: ${(props) => props.theme.textSecondary};
  font-size: 13px;
`;

const StaleNote = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: ${(props) => props.theme.warning};
  font-size: 13px;
`;

const ReviewerRows = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const ReviewerRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  color: ${(props) => props.theme.text};
  font-size: 13px;
`;

const ReviewerIdentity = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;

  span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
`;

const ReviewerState = styled.span`
  color: ${(props) => props.theme.textTertiary};
  white-space: nowrap;
`;

const ReviewerDot = styled.span`
  width: 20px;
  height: 20px;
  border-radius: 6px;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: white;
  background: ${(props) => props.theme.textTertiary};

  &[data-action="approve"] {
    background: ${(p) => p.theme.brand?.green ?? "#22c55e"};
  }
  &[data-action="request_changes"] {
    background: ${(p) => p.theme.brand?.red ?? "#ef4444"};
  }
  &[data-action="pending"] {
    background: ${(p) => p.theme.textTertiary};
  }
`;

const HistoryList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const HistoryRow = styled.div`
  display: flex;
  gap: 8px;
  align-items: flex-start;
`;

const HistoryDot = styled.span`
  width: 22px;
  height: 22px;
  border-radius: 6px;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: white;
  background: ${(props) => props.theme.textTertiary};

  &[data-action="approve"] {
    background: ${(p) => p.theme.brand?.green ?? "#22c55e"};
  }
  &[data-action="request_changes"] {
    background: ${(p) => p.theme.brand?.red ?? "#ef4444"};
  }
  &[data-action="cancel"] {
    background: ${(p) => p.theme.textTertiary};
  }
  &[data-action="re_request"] {
    background: ${(p) => p.theme.brand?.yellow ?? "#f59e0b"};
  }
  &[data-action="unlock"] {
    background: ${(p) => p.theme.brand?.marine ?? "#0c1622"};
  }
`;

const HistoryBody = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
`;

const HistoryHeading = styled.div`
  font-size: 13px;
  line-height: 22px;
  color: ${(props) => props.theme.text};

  strong {
    font-weight: 600;
  }
`;

const HistoryTime = styled.span`
  color: ${(props) => props.theme.textTertiary};
`;

const HistoryComment = styled.div`
  font-size: 13px;
  color: ${(props) => props.theme.textSecondary};
  background: ${(props) => props.theme.backgroundSecondary};
  border-left: 2px solid ${(props) => props.theme.divider};
  padding: 6px 10px;
  border-radius: 0 4px 4px 0;
  margin-top: 4px;
  white-space: pre-wrap;
`;

const BarContent = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  min-width: 0;
`;

const Badge = styled.span<{ $tone: Tone }>`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 28px;
  padding: 0 9px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.01em;
  background: ${(p) => toneColor(p.theme, p.$tone)}1a;
  border: 1px solid ${(p) => toneColor(p.theme, p.$tone)}33;
  color: ${(p) => toneColor(p.theme, p.$tone)};
  white-space: nowrap;
`;

const IconText = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: ${(props) => props.theme.textSecondary};
  min-height: 28px;
  white-space: nowrap;

  svg {
    color: ${(props) => props.theme.textTertiary};
    flex-shrink: 0;
  }

  strong {
    color: ${(props) => props.theme.text};
    font-weight: 600;
  }
`;

const BarActions = styled.div`
  display: flex;
  gap: 6px;
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
  &::placeholder {
    color: ${(props) => props.theme.textTertiary};
  }
  &:focus {
    outline: none;
    border-color: ${(props) => props.theme.brand?.marine ?? props.theme.text};
  }
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

  &:last-child {
    border-bottom: none;
  }

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
  border: 1.5px solid
    ${(p) =>
      p.$checked ? (p.theme.brand?.marine ?? "#0c1622") : p.theme.divider};
  background: ${(p) =>
    p.$checked ? (p.theme.brand?.marine ?? "#0c1622") : "transparent"};
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
  &:disabled {
    opacity: 0.5;
  }
`;

const PickerActions = styled.div`
  display: flex;
  gap: 8px;
`;

export default observer(DocApprovalBarInner);
