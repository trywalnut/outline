import { observer } from "mobx-react";
import { CloseIcon, PlusIcon } from "outline-icons";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import styled from "styled-components";
import { client } from "~/utils/ApiClient";
import { toast } from "sonner";

/**
 * In-document tag chips bar — renders below the document title and shows the
 * tags currently applied to this doc, with a "+ Add tag" affordance that
 * opens a popover listing all workspace tags.
 *
 * Fails gracefully if the tag API errors.
 */

interface Tag {
  id: string;
  name: string;
  color: string | null;
}

interface Props {
  documentId: string;
  canEdit?: boolean;
}

function DocTagBarInner({ documentId, canEdit = false }: Props) {
  const [applied, setApplied] = useState<Tag[]>([]);
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [errored, setErrored] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await client.post("/arrow.documents.tags", { documentId });
      const data = (res as { data?: { tags?: Tag[] } } | null)?.data;
      setApplied(data?.tags ?? []);
    } catch {
      setErrored(true);
    }
  }, [documentId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!popoverOpen) return;
    void (async () => {
      try {
        const res = await client.post("/arrow.tags.list", {});
        const data = (res as { data?: { tags?: Tag[] } } | null)?.data;
        setAllTags(data?.tags ?? []);
      } catch {
        // ignore
      }
    })();
  }, [popoverOpen]);

  // Close popover on outside click
  useEffect(() => {
    if (!popoverOpen) return;
    function onDown(event: MouseEvent) {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(event.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(event.target as Node)
      ) {
        setPopoverOpen(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [popoverOpen]);

  const handleAdd = useCallback(
    async (tag: Tag) => {
      try {
        await client.post("/arrow.documents.addTag", { documentId, tagId: tag.id });
        await refresh();
      } catch (err) {
        toast.error("Failed to add tag");
      }
    },
    [documentId, refresh]
  );

  const handleRemove = useCallback(
    async (tag: Tag) => {
      try {
        await client.post("/arrow.documents.removeTag", { documentId, tagId: tag.id });
        await refresh();
      } catch (err) {
        toast.error("Failed to remove tag");
      }
    },
    [documentId, refresh]
  );

  const appliedIds = useMemo(() => new Set(applied.map((t) => t.id)), [applied]);
  const available = useMemo(
    () => allTags.filter((t) => !appliedIds.has(t.id)),
    [allTags, appliedIds]
  );

  // Hide entirely on persistent errors so the doc still renders
  if (errored) return null;
  // Don't render an empty bar if user has no edit access and no tags
  if (applied.length === 0 && !canEdit) return null;

  return (
    <Bar>
      {applied.map((tag) => (
        <Chip key={tag.id} $color={tag.color || "#3b82f6"}>
          <ChipDot $color={tag.color || "#3b82f6"} />
          <ChipName>{tag.name}</ChipName>
          {canEdit && (
            <ChipRemove
              type="button"
              aria-label={`Remove ${tag.name}`}
              onClick={() => handleRemove(tag)}
            >
              <CloseIcon size={12} />
            </ChipRemove>
          )}
        </Chip>
      ))}

      {canEdit && (
        <AddWrap>
          <AddBtn
            ref={triggerRef}
            type="button"
            onClick={() => setPopoverOpen((o) => !o)}
            aria-haspopup="listbox"
            aria-expanded={popoverOpen}
          >
            <PlusIcon size={14} />
            Add tag
          </AddBtn>

          {popoverOpen && (
            <Popover ref={popoverRef} role="listbox">
              {available.length === 0 ? (
                <PopoverEmpty>
                  {allTags.length === 0
                    ? "No tags yet — create some in Settings → Tags."
                    : "All tags applied."}
                </PopoverEmpty>
              ) : (
                available.map((tag) => (
                  <PopoverRow
                    key={tag.id}
                    type="button"
                    onClick={() => {
                      void handleAdd(tag);
                      setPopoverOpen(false);
                    }}
                  >
                    <ChipDot $color={tag.color || "#3b82f6"} />
                    {tag.name}
                  </PopoverRow>
                ))
              )}
            </Popover>
          )}
        </AddWrap>
      )}
    </Bar>
  );
}

const Bar = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-bottom: 12px;
`;

const Chip = styled.span<{ $color: string }>`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 4px 4px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 500;
  background: ${(p) => p.$color}1a;
  border: 1px solid ${(p) => p.$color}40;
  color: ${(props) => props.theme.text};
`;

const ChipDot = styled.span<{ $color: string }>`
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: ${(p) => p.$color};
  flex-shrink: 0;
`;

const ChipName = styled.span`
  letter-spacing: 0.01em;
`;

const ChipRemove = styled.button`
  border: none;
  background: transparent;
  cursor: pointer;
  padding: 2px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: ${(props) => props.theme.textTertiary};
  opacity: 0.6;
  margin-left: 2px;
  transition: all 120ms ease;

  &:hover {
    opacity: 1;
    background: ${(props) => props.theme.divider};
    color: ${(props) => props.theme.text};
  }
`;

const AddWrap = styled.div`
  position: relative;
  display: inline-flex;
`;

const AddBtn = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border-radius: 999px;
  border: 1px dashed ${(props) => props.theme.divider};
  background: transparent;
  font-size: 12px;
  color: ${(props) => props.theme.textSecondary};
  cursor: pointer;
  font-family: inherit;
  transition: all 120ms ease;

  &:hover {
    color: ${(props) => props.theme.text};
    border-color: ${(props) => props.theme.textTertiary};
    border-style: solid;
    background: ${(props) => props.theme.backgroundSecondary};
  }
`;

const Popover = styled.div`
  position: absolute;
  top: 100%;
  left: 0;
  margin-top: 6px;
  min-width: 200px;
  max-height: 280px;
  overflow-y: auto;
  background: ${(props) => props.theme.background};
  border: 1px solid ${(props) => props.theme.divider};
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
  padding: 4px;
  z-index: 30;
`;

const PopoverEmpty = styled.div`
  padding: 16px;
  font-size: 12px;
  color: ${(props) => props.theme.textTertiary};
  text-align: center;
`;

const PopoverRow = styled.button`
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  border: none;
  background: transparent;
  padding: 8px 10px;
  border-radius: 6px;
  cursor: pointer;
  text-align: left;
  font-size: 13px;
  color: ${(props) => props.theme.text};
  font-family: inherit;

  &:hover {
    background: ${(props) => props.theme.backgroundSecondary};
  }
`;

export default observer(DocTagBarInner);
