import { PluginManager, Hook } from "@server/utils/PluginManager";
import config from "../plugin.json";
import router from "./api/router";

/**
 * arrow-tags plugin entry. Always enabled — there's no env-var gate because
 * the feature is core to the Arrow workflow. Disabling it would just mean
 * dropping the plugin from the build.
 */
PluginManager.add({
  ...config,
  type: Hook.API,
  value: router,
});
