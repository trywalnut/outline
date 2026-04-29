import { observer } from "mobx-react";
import { CheckmarkIcon, CloseIcon, HashtagIcon, PlusIcon } from "outline-icons";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import styled, { css, keyframes } from "styled-components";
import Button from "~/components/Button";
import Heading from "~/components/Heading";
import Input from "~/components/Input";
import Scene from "~/components/Scene";
import Text from "~/components/Text";
import { client } from "~/utils/ApiClient";
import { toast } from "sonner";

/**
 * arrow-tags settings page — polished v2.
 *
 * Design beats:
 *   1. Hero create card with live preview chip
 *   2. Curated 12-color palette tuned for both dark and light themes
 *   3. Tag list rendered as actual chip pills, not list rows
 *   4. Empty state suggests three example tag names to seed the form
 *   5. In-page search + tag count once the list grows past zero
 */

interface Tag {
  id: string;
  name: string;
  color: string | null;
  createdById: string;
  createdAt: string;
}

/**
 * Curated color palette for tag swatches. These shades read well on both
 * Outline's light and dark themes — saturated enough to feel intentional,
 * desaturated enough to not yell at the user. Order moves through the
 * spectrum to give the picker rhythm.
 */
const COLOR_PRESETS = [
  "#ef4444", // red
  "#f97316", // orange
  "#f59e0b", // amber
  "#eab308", // yellow
  "#84cc16", // lime
  "#22c55e", // green
  "#14b8a6", // teal
  "#06b6d4", // cyan
  "#3b82f6", // blue
  "#6366f1", // indigo
  "#a855f7", // purple
  "#ec4899", // pink
];

const DEFAULT_COLOR = COLOR_PRESETS[8]; // blue

const EXAMPLE_TAGS = ["denials", "underpayments", "v2-spec"];

function ArrowTagsSettings() {
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(DEFAULT_COLOR);
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState("");
  const nameInputRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await client.post("/arrow.tags.list", {});
      const data = (res as { data?: { tags?: Tag[] } } | null)?.data;
      setTags(data?.tags ?? []);
    } catch (err) {
      toast.error("Failed to load tags");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleCreate = useCallback(
    async (event?: React.FormEvent) => {
      event?.preventDefault();
      const name = newName.trim();
      if (!name) {
        return;
      }
      setCreating(true);
      try {
        await client.post("/arrow.tags.create", { name, color: newColor });
        setNewName("");
        setNewColor(DEFAULT_COLOR);
        await refresh();
        toast.success(`Created “${name}”`);
        nameInputRef.current?.focus();
      } catch (err) {
        const message = (err as { message?: string }).message ?? "Failed to create tag";
        toast.error(message);
      } finally {
        setCreating(false);
      }
    },
    [newName, newColor, refresh]
  );

  const handleDelete = useCallback(
    async (tag: Tag) => {
      if (!window.confirm(`Delete the tag “${tag.name}”? It will be removed from every document it's on.`)) {
        return;
      }
      try {
        await client.post("/arrow.tags.delete", { id: tag.id });
        await refresh();
        toast.success(`Deleted “${tag.name}”`);
      } catch (err) {
        toast.error("Failed to delete tag");
      }
    },
    [refresh]
  );

  const handleExampleClick = useCallback(
    (name: string) => {
      setNewName(name);
      nameInputRef.current?.focus();
    },
    []
  );

  const filteredTags = useMemo(() => {
    if (!search.trim()) {
      return tags;
    }
    const q = search.trim().toLowerCase();
    return tags.filter((t) => t.name.toLowerCase().includes(q));
  }, [tags, search]);

  const previewName = newName.trim() || "preview";

  return (
    <Scene title="Tags">
      <PageHeader>
        <Heading>Tags</Heading>
        <Lede type="secondary">
          Team-scoped labels you apply to documents to group specs by domain,
          status, or whatever convention your team agrees on. Visible to
          everyone in the workspace.
        </Lede>
      </PageHeader>

      <CreateCard>
        <CardLabel>Create a tag</CardLabel>
        <CreateForm onSubmit={handleCreate}>
          <FieldGroup>
            <FieldLabel htmlFor="arrow-tag-name">Name</FieldLabel>
            <Input
              id="arrow-tag-name"
              ref={nameInputRef as never}
              required
              maxLength={30}
              placeholder="e.g. denials, underpayments, v2-spec"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              autoComplete="off"
            />
            <Counter $warning={newName.length > 25}>{newName.length}/30</Counter>
          </FieldGroup>

          <FieldGroup>
            <FieldLabel>Color</FieldLabel>
            <Swatches role="radiogroup" aria-label="Tag color">
              {COLOR_PRESETS.map((color) => (
                <SwatchButton
                  key={color}
                  type="button"
                  role="radio"
                  aria-checked={newColor === color}
                  aria-label={`Color ${color}`}
                  $color={color}
                  $selected={newColor === color}
                  onClick={() => setNewColor(color)}
                >
                  {newColor === color && <CheckmarkIcon size={16} color="white" />}
                </SwatchButton>
              ))}
              <CustomColor>
                <CustomColorInput
                  type="color"
                  value={newColor}
                  onChange={(e) => setNewColor(e.target.value)}
                  aria-label="Custom color"
                />
              </CustomColor>
            </Swatches>
          </FieldGroup>

          <FieldGroup>
            <FieldLabel>Preview</FieldLabel>
            <PreviewRow>
              <PreviewChip $color={newColor}>
                <ChipDot $color={newColor} />
                {previewName}
              </PreviewChip>
              <PreviewHint type="tertiary">
                this is what it will look like applied to a doc
              </PreviewHint>
            </PreviewRow>
          </FieldGroup>

          <Submit
            type="submit"
            icon={<PlusIcon />}
            disabled={creating || !newName.trim()}
          >
            {creating ? "Creating…" : "Create tag"}
          </Submit>
        </CreateForm>
      </CreateCard>

      <Divider />

      {loading ? (
        <DimText>Loading…</DimText>
      ) : tags.length === 0 ? (
        <EmptyState>
          <EmptyIconWrap>
            <HashtagIcon size={32} />
          </EmptyIconWrap>
          <EmptyTitle>No tags yet</EmptyTitle>
          <EmptyBody type="secondary">
            Tags help your team find specs the same way they find code in a
            file tree. Pick a starting set — you can always change them later.
          </EmptyBody>
          <ExamplesRow>
            {EXAMPLE_TAGS.map((name) => (
              <ExampleChip
                key={name}
                type="button"
                onClick={() => handleExampleClick(name)}
              >
                <PlusIcon size={14} />
                {name}
              </ExampleChip>
            ))}
          </ExamplesRow>
        </EmptyState>
      ) : (
        <>
          <ListToolbar>
            <ListMeta>
              <strong>{tags.length}</strong>{" "}
              {tags.length === 1 ? "tag" : "tags"} in this workspace
              {search.trim() && filteredTags.length !== tags.length && (
                <span> · {filteredTags.length} matching</span>
              )}
            </ListMeta>
            <SearchInput
              type="search"
              placeholder="Filter tags…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </ListToolbar>

          {filteredTags.length === 0 ? (
            <NoMatch type="secondary">No tags match “{search}”.</NoMatch>
          ) : (
            <TagGrid>
              {filteredTags.map((tag) => (
                <TagPill key={tag.id} $color={tag.color || DEFAULT_COLOR}>
                  <ChipDot $color={tag.color || DEFAULT_COLOR} />
                  <PillName>{tag.name}</PillName>
                  <RemoveBtn
                    type="button"
                    onClick={() => handleDelete(tag)}
                    aria-label={`Delete ${tag.name}`}
                  >
                    <CloseIcon size={14} />
                  </RemoveBtn>
                </TagPill>
              ))}
            </TagGrid>
          )}
        </>
      )}
    </Scene>
  );
}

// ── styles ──────────────────────────────────────────────────────────────

const PageHeader = styled.div`
  margin-bottom: 32px;
`;

const Lede = styled(Text)`
  max-width: 56ch;
  line-height: 1.5;
  margin-top: 4px;
`;

const CreateCard = styled.section`
  border: 1px solid ${(props) => props.theme.divider};
  border-radius: 12px;
  padding: 24px 28px;
  background: ${(props) => props.theme.backgroundSecondary};
  display: flex;
  flex-direction: column;
  gap: 20px;
  position: relative;

  &::before {
    content: "";
    position: absolute;
    inset: 0;
    border-radius: 12px;
    pointer-events: none;
    background: radial-gradient(
      ellipse at top right,
      ${(props) => props.theme.brand?.marine ?? "#0c1622"}08,
      transparent 60%
    );
  }
`;

const CardLabel = styled.div`
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  font-weight: 700;
  color: ${(props) => props.theme.textTertiary};
`;

const CreateForm = styled.form`
  display: flex;
  flex-direction: column;
  gap: 18px;
`;

const FieldGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  position: relative;
`;

const FieldLabel = styled.label`
  font-size: 12px;
  font-weight: 600;
  color: ${(props) => props.theme.textSecondary};
  letter-spacing: 0.02em;
`;

const Counter = styled.span<{ $warning?: boolean }>`
  position: absolute;
  right: 12px;
  bottom: 10px;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  color: ${(props) => (props.$warning ? props.theme.brand?.red ?? "#dc2626" : props.theme.textTertiary)};
  pointer-events: none;
`;

const Swatches = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
`;

const swatchPulse = keyframes`
  0% { box-shadow: 0 0 0 0 currentColor; }
  100% { box-shadow: 0 0 0 6px transparent; }
`;

const SwatchButton = styled.button<{ $color: string; $selected: boolean }>`
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: none;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: transform 120ms ease, box-shadow 120ms ease;
  background: ${(p) => p.$color};
  color: ${(p) => p.$color};
  position: relative;

  ${(p) =>
    p.$selected
      ? css`
          transform: scale(1.08);
          box-shadow:
            0 0 0 2px ${(props) => props.theme.background},
            0 0 0 4px ${p.$color};
          animation: ${swatchPulse} 480ms ease-out;
        `
      : css`
          &:hover {
            transform: scale(1.08);
            box-shadow: 0 0 0 2px ${(props) => props.theme.background},
              0 0 0 3px ${p.$color}80;
          }
        `}

  &:focus-visible {
    outline: 2px solid ${(p) => p.$color};
    outline-offset: 2px;
  }
`;

const CustomColor = styled.div`
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 1px dashed ${(props) => props.theme.divider};
  display: inline-flex;
  align-items: center;
  justify-content: center;
  position: relative;
  overflow: hidden;
  background:
    conic-gradient(
      from 0deg,
      #ef4444, #f59e0b, #eab308, #22c55e, #06b6d4, #6366f1, #ec4899, #ef4444
    );

  &::after {
    content: "";
    position: absolute;
    inset: 4px;
    border-radius: 50%;
    background: ${(props) => props.theme.background};
  }
`;

const CustomColorInput = styled.input`
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
  z-index: 1;
`;

const PreviewRow = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
`;

const PreviewHint = styled(Text)`
  font-size: 12px;
  font-style: italic;
`;

const PreviewChip = styled.span<{ $color: string }>`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px 6px 10px;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 500;
  color: ${(props) => props.theme.text};
  background: ${(p) => p.$color}1a;
  border: 1px solid ${(p) => p.$color}40;
  transition: all 200ms ease;
`;

const ChipDot = styled.span<{ $color: string }>`
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: ${(p) => p.$color};
  flex-shrink: 0;
`;

const Submit = styled(Button)`
  align-self: flex-start;
`;

const Divider = styled.hr`
  border: 0;
  border-top: 1px solid ${(props) => props.theme.divider};
  margin: 36px 0 24px;
`;

const DimText = styled(Text).attrs({ type: "secondary" })`
  text-align: center;
  padding: 32px;
`;

// ── empty state ──

const EmptyState = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 48px 24px 64px;
  gap: 12px;
`;

const EmptyIconWrap = styled.div`
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: ${(props) => props.theme.backgroundSecondary};
  display: flex;
  align-items: center;
  justify-content: center;
  color: ${(props) => props.theme.textTertiary};
  margin-bottom: 4px;
`;

const EmptyTitle = styled.div`
  font-size: 18px;
  font-weight: 600;
  color: ${(props) => props.theme.text};
`;

const EmptyBody = styled(Text)`
  max-width: 44ch;
  line-height: 1.5;
`;

const ExamplesRow = styled.div`
  display: flex;
  gap: 8px;
  margin-top: 16px;
  flex-wrap: wrap;
  justify-content: center;
`;

const ExampleChip = styled.button`
  border: 1px dashed ${(props) => props.theme.divider};
  background: transparent;
  color: ${(props) => props.theme.textSecondary};
  padding: 6px 12px 6px 10px;
  border-radius: 999px;
  font-size: 13px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-family: inherit;
  transition: all 150ms ease;

  &:hover {
    color: ${(props) => props.theme.text};
    border-color: ${(props) => props.theme.textTertiary};
    border-style: solid;
    background: ${(props) => props.theme.backgroundSecondary};
  }
`;

// ── tag list ──

const ListToolbar = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
  flex-wrap: wrap;
`;

const ListMeta = styled.div`
  font-size: 13px;
  color: ${(props) => props.theme.textSecondary};

  strong {
    color: ${(props) => props.theme.text};
    font-weight: 600;
  }
`;

const SearchInput = styled.input`
  appearance: none;
  border: 1px solid ${(props) => props.theme.divider};
  background: transparent;
  color: ${(props) => props.theme.text};
  border-radius: 8px;
  padding: 6px 12px;
  font-size: 13px;
  width: 220px;
  font-family: inherit;
  transition: border-color 150ms ease, box-shadow 150ms ease;

  &::placeholder {
    color: ${(props) => props.theme.textTertiary};
  }

  &:focus {
    outline: none;
    border-color: ${(props) => props.theme.brand?.marine ?? props.theme.text};
    box-shadow: 0 0 0 3px ${(props) => props.theme.brand?.marine ?? "#0c1622"}20;
  }
`;

const NoMatch = styled(Text)`
  text-align: center;
  padding: 32px;
`;

const TagGrid = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
`;

const TagPill = styled.div<{ $color: string }>`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 8px 8px 14px;
  border-radius: 999px;
  background: ${(p) => p.$color}14;
  border: 1px solid ${(p) => p.$color}33;
  font-size: 13.5px;
  font-weight: 500;
  color: ${(props) => props.theme.text};
  transition: all 160ms ease;
  position: relative;

  &:hover {
    background: ${(p) => p.$color}22;
    border-color: ${(p) => p.$color}66;
    transform: translateY(-1px);
  }
`;

const PillName = styled.span`
  letter-spacing: 0.01em;
`;

const RemoveBtn = styled.button`
  border: none;
  background: transparent;
  cursor: pointer;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: ${(props) => props.theme.textTertiary};
  opacity: 0.5;
  transition: all 120ms ease;
  padding: 0;

  ${TagPill}:hover & {
    opacity: 1;
  }

  &:hover {
    background: ${(props) => props.theme.divider};
    color: ${(props) => props.theme.text};
  }
`;

export default observer(ArrowTagsSettings);
