import { createLazyComponent } from "~/components/LazyLoad";
import { Hook, PluginManager } from "~/utils/PluginManager";
import config from "../plugin.json";
import Icon from "./Icon";

PluginManager.add([
  {
    ...config,
    type: Hook.Settings,
    value: {
      group: "Workspace",
      icon: Icon,
      description:
        "Tag documents with team-scoped labels for categorization and filtering.",
      component: createLazyComponent(() => import("./Settings")),
    },
  },
]);
