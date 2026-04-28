import Document from "@server/models/Document";
import { PluginManager, Hook } from "@server/utils/PluginManager";
import config from "../plugin.json";
import router from "./api/router";
import { preventEditWhenLocked } from "./hooks/documentLock";

/**
 * arrow-approvals plugin entry.
 *
 * Registers:
 *   - HTTP API for review request / approve / request-changes / cancel / unlock
 *   - Sequelize beforeUpdate hook on Document to enforce the edit-lock when
 *     a review is in `approved` state.
 *
 * The hook is added via `Document.addHook(...)` rather than by patching
 * server/models/Document.ts so the merge surface against upstream stays
 * limited to server/models/index.ts (model registration only).
 */
PluginManager.add({
  ...config,
  type: Hook.API,
  value: router,
});

Document.addHook("beforeUpdate", "arrowApprovalsLock", preventEditWhenLocked);
