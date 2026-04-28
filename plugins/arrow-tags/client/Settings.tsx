import { observer } from "mobx-react";
import { CloseIcon, PlusIcon } from "outline-icons";
import { useCallback, useEffect, useState } from "react";
import styled from "styled-components";
import Button from "~/components/Button";
import Heading from "~/components/Heading";
import Input from "~/components/Input";
import Scene from "~/components/Scene";
import Text from "~/components/Text";
import { client } from "~/utils/ApiClient";
import { toast } from "sonner";

/**
 * arrow-tags settings page. Lists all team tags, lets admins create new ones
 * and delete existing ones. Surfaced under the workspace settings group via
 * the plugin's Hook.Settings registration in client/index.tsx.
 *
 * Direct ApiClient calls (no MobX store) are used for v1 simplicity — tags
 * are a flat list with low read frequency, so caching isn't worth the extra
 * abstraction yet.
 */

interface Tag {
  id: string;
  name: string;
  color: string | null;
  createdById: string;
  createdAt: string;
}

const DEFAULT_COLOR = "#0c1622";

function ArrowTagsSettings() {
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(DEFAULT_COLOR);
  const [creating, setCreating] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await client.post("/arrow.tags.list", {});
      setTags(((res as { tags?: Tag[] }).tags) ?? []);
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
    async (event: React.FormEvent) => {
      event.preventDefault();
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
        toast.success(`Created "${name}"`);
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
      if (!window.confirm(`Delete tag "${tag.name}"? This will remove it from all documents.`)) {
        return;
      }
      try {
        await client.post("/arrow.tags.delete", { id: tag.id });
        await refresh();
        toast.success(`Deleted "${tag.name}"`);
      } catch (err) {
        toast.error("Failed to delete tag");
      }
    },
    [refresh]
  );

  return (
    <Scene title="Tags">
      <Heading>Tags</Heading>
      <Text as="p" type="secondary">
        Tags are team-scoped labels you can apply to documents to categorize
        them by domain, status, or any other team convention. They're scoped
        to your workspace and visible to all members.
      </Text>

      <CreateForm onSubmit={handleCreate}>
        <Input
          required
          maxLength={30}
          placeholder="Tag name"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
        />
        <ColorInput
          type="color"
          value={newColor}
          onChange={(e) => setNewColor(e.target.value)}
          aria-label="Tag color"
        />
        <Button type="submit" icon={<PlusIcon />} disabled={creating || !newName.trim()}>
          Create tag
        </Button>
      </CreateForm>

      {loading ? (
        <Text type="secondary">Loading…</Text>
      ) : tags.length === 0 ? (
        <Text type="secondary">No tags yet. Create your first one above.</Text>
      ) : (
        <TagList>
          {tags.map((tag) => (
            <TagRow key={tag.id}>
              <Swatch style={{ background: tag.color || "#888" }} />
              <TagName>{tag.name}</TagName>
              <DeleteButton
                type="button"
                onClick={() => handleDelete(tag)}
                aria-label={`Delete ${tag.name}`}
              >
                <CloseIcon />
              </DeleteButton>
            </TagRow>
          ))}
        </TagList>
      )}
    </Scene>
  );
}

const CreateForm = styled.form`
  display: flex;
  gap: 8px;
  align-items: center;
  margin: 16px 0;
`;

const ColorInput = styled.input`
  width: 32px;
  height: 32px;
  border: none;
  background: none;
  cursor: pointer;
  padding: 0;
`;

const TagList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 16px;
`;

const TagRow = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  border-radius: 6px;
  background: ${(props) => props.theme.backgroundSecondary};
`;

const Swatch = styled.span`
  display: inline-block;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  flex-shrink: 0;
`;

const TagName = styled.span`
  flex: 1;
  font-weight: 500;
`;

const DeleteButton = styled.button`
  border: none;
  background: none;
  cursor: pointer;
  color: ${(props) => props.theme.textSecondary};
  display: inline-flex;
  align-items: center;
  padding: 4px;

  &:hover {
    color: ${(props) => props.theme.text};
  }
`;

export default observer(ArrowTagsSettings);
