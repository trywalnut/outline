import { observer } from "mobx-react";
import { CheckmarkIcon, CloseIcon, PlusIcon } from "outline-icons";
import { useCallback, useEffect, useRef, useState } from "react";
import styled, { css } from "styled-components";
import Button from "~/components/Button";
import Heading from "~/components/Heading";
import Input from "~/components/Input";
import Scene from "~/components/Scene";
import Text from "~/components/Text";
import { client } from "~/utils/ApiClient";
import { toast } from "sonner";

interface Tag {
  id: string;
  name: string;
  color: string | null;
  createdById: string;
  createdAt: string;
}

const COLOR_PRESETS = [
  "#ef4444",
  "#f97316",
  "#f59e0b",
  "#eab308",
  "#84cc16",
  "#22c55e",
  "#14b8a6",
  "#06b6d4",
  "#3b82f6",
  "#6366f1",
  "#a855f7",
  "#ec4899",
];

const DEFAULT_COLOR = COLOR_PRESETS[8];

function ArrowTagsSettings() {
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(DEFAULT_COLOR);
  const [creating, setCreating] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await client.post("/arrow.tags.list", {});
      const data = (res as { data?: { tags?: Tag[] } } | null)?.data;
      setTags(data?.tags ?? []);
    } catch {
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
        nameInputRef.current?.focus();
      } catch (err) {
        const message =
          (err as { message?: string }).message ?? "Failed to create tag";
        toast.error(message);
      } finally {
        setCreating(false);
      }
    },
    [newName, newColor, refresh]
  );

  const handleDelete = useCallback(
    async (tag: Tag) => {
      if (
        !window.confirm(
          `Delete the tag “${tag.name}”? It will be removed from every document it's on.`
        )
      ) {
        return;
      }
      try {
        await client.post("/arrow.tags.delete", { id: tag.id });
        await refresh();
      } catch {
        toast.error("Failed to delete tag");
      }
    },
    [refresh]
  );

  return (
    <Scene title="Tags">
      <Heading>Tags</Heading>
      <Lede type="secondary">
        Team-scoped labels you apply to documents. Visible to everyone in the
        workspace.
      </Lede>

      <Form onSubmit={handleCreate}>
        <Input
          ref={nameInputRef as never}
          required
          maxLength={30}
          placeholder="Tag name (e.g. denials, v2-spec)"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          autoComplete="off"
        />
        <Swatches role="radiogroup" aria-label="Tag color">
          {COLOR_PRESETS.map((color) => (
            <Swatch
              key={color}
              type="button"
              role="radio"
              aria-checked={newColor === color}
              aria-label={`Color ${color}`}
              $color={color}
              $selected={newColor === color}
              onClick={() => setNewColor(color)}
            >
              {newColor === color && <CheckmarkIcon size={14} color="white" />}
            </Swatch>
          ))}
        </Swatches>
        <Button
          type="submit"
          icon={<PlusIcon />}
          disabled={creating || !newName.trim()}
        >
          {creating ? "Creating…" : "Create"}
        </Button>
      </Form>

      {loading ? null : tags.length === 0 ? (
        <EmptyHint type="tertiary">
          No tags yet — create one above to get started.
        </EmptyHint>
      ) : (
        <TagGrid>
          {tags.map((tag) => (
            <TagPill key={tag.id} $color={tag.color || DEFAULT_COLOR}>
              <Dot $color={tag.color || DEFAULT_COLOR} />
              {tag.name}
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
    </Scene>
  );
}

const Lede = styled(Text)`
  max-width: 56ch;
  margin: 4px 0 24px;
`;

const Form = styled.form`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  margin-bottom: 32px;

  > div:first-of-type {
    flex: 1 1 240px;
    margin: 0;
  }
`;

const Swatches = styled.div`
  display: inline-flex;
  gap: 6px;
`;

const Swatch = styled.button<{ $color: string; $selected: boolean }>`
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: none;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: ${(p) => p.$color};
  transition: transform 120ms ease, box-shadow 120ms ease;

  ${(p) =>
    p.$selected
      ? css`
          box-shadow:
            0 0 0 2px ${(props) => props.theme.background},
            0 0 0 4px ${p.$color};
        `
      : css`
          &:hover {
            transform: scale(1.12);
          }
        `}

  &:focus-visible {
    outline: 2px solid ${(p) => p.$color};
    outline-offset: 2px;
  }
`;

const EmptyHint = styled(Text)`
  display: block;
  padding: 24px 0;
`;

const TagGrid = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
`;

const TagPill = styled.div<{ $color: string }>`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 6px 4px 10px;
  border-radius: 999px;
  background: ${(p) => p.$color}14;
  border: 1px solid ${(p) => p.$color}33;
  font-size: 13px;
  color: ${(props) => props.theme.text};

  &:hover {
    background: ${(p) => p.$color}22;
    border-color: ${(p) => p.$color}55;
  }
`;

const Dot = styled.span<{ $color: string }>`
  display: inline-block;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: ${(p) => p.$color};
`;

const RemoveBtn = styled.button`
  border: none;
  background: transparent;
  cursor: pointer;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: ${(props) => props.theme.textTertiary};
  opacity: 0.6;
  padding: 0;

  &:hover {
    background: ${(props) => props.theme.divider};
    color: ${(props) => props.theme.text};
    opacity: 1;
  }
`;

export default observer(ArrowTagsSettings);
