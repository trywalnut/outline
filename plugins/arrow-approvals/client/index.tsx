import { createLazyComponent } from "~/components/LazyLoad";
import { Hook, PluginManager } from "~/utils/PluginManager";
import config from "../plugin.json";
import Icon from "./Icon";

PluginManager.add([
  {
    ...config,
    type: Hook.Settings,
    value: {
      group: "Account",
      icon: Icon,
      description:
        "Track specs awaiting your review and ones you've authored.",
      component: createLazyComponent(() => import("./Settings")),
    },
  },
]);
