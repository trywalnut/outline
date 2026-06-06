import { existsSync, mkdirSync } from "node:fs";
import env from "@server/env";
import Logger from "@server/logging/Logger";
import {
  PluginManager,
  PluginPriority,
  Hook,
} from "@server/utils/PluginManager";
import router from "./api/files";

if (env.FILE_STORAGE === "local") {
  const rootDir = env.FILE_STORAGE_LOCAL_ROOT_DIR;
  try {
    if (!existsSync(rootDir)) {
      mkdirSync(rootDir, { recursive: true });
      Logger.debug("utils", `Created ${rootDir} for local storage`);
    }
  } catch (err) {
    Logger.fatal(
      `Failed to create directory for local file storage at ${env.FILE_STORAGE_LOCAL_ROOT_DIR}`,
      err
    );
  }
}

// The files.get route serves attachments through the API rather than
// redirecting straight to storage. Local storage relies on it for all
// downloads; object storage (S3) needs it specifically to serve sandboxed HTML
// artifact previews with the right Content-Security-Policy headers, which a
// presigned storage URL cannot set. So enable it whenever file storage is
// configured, not only for local storage.
const enabled = !!(
  env.FILE_STORAGE_UPLOAD_MAX_SIZE &&
  (env.FILE_STORAGE !== "local" || env.FILE_STORAGE_LOCAL_ROOT_DIR)
);

if (enabled) {
  PluginManager.add([
    {
      name: "File storage",
      description:
        "Serves file attachments through the API, including sandboxed HTML artifact previews",
      type: Hook.API,
      value: router,
      priority: PluginPriority.Normal,
    },
  ]);
}
