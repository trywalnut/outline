import { PluginManager, Hook } from "@server/utils/PluginManager";
import config from "../plugin.json";
import DailyReviewRemindersTask from "./tasks/DailyReviewRemindersTask";

/**
 * arrow-reminders plugin entry. Registers the daily cron task that
 * sweeps pending review requests and sends Slack DM digests.
 */
PluginManager.add({
  ...config,
  type: Hook.Task,
  value: DailyReviewRemindersTask,
});
