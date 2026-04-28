import httpErrors from "http-errors";
import Document from "@server/models/Document";
import { ApprovalEngine } from "../services/ApprovalEngine";

/**
 * Sequelize hook that prevents updates to a document while an active
 * approved review exists for it (without a subsequent unlock).
 *
 * Registered via `Document.addHook("beforeUpdate", ...)` in the plugin
 * entry — that's a runtime hook registration, no patches to core
 * Document.ts needed.
 *
 * Note: we deliberately allow updates when state is `pending` (matches
 * "Pending review does not lock edits" scenario in approvals.feature) —
 * those edits are surfaced to reviewers via a separate notification path.
 */
export async function preventEditWhenLocked(instance: Document): Promise<void> {
  // Skip on initial creation; only check updates.
  if (instance.isNewRecord) {
    return;
  }
  // Only check fields whose change actually means "edit content."
  // Fields like `archivedAt`, `pinnedAt`, `lastViewedAt` shouldn't trip the lock.
  const watchedFields = ["title", "text", "content", "icon", "color"];
  const dirty = watchedFields.some((f) => (instance as unknown as { changed: (k: string) => boolean }).changed(f));
  if (!dirty) {
    return;
  }
  if (await ApprovalEngine.isLocked(instance.id)) {
    throw httpErrors(409, "document is locked by an approved review", {
      id: "document_locked",
      isReportable: false,
    });
  }
}
