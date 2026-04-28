import { Op } from "sequelize";
import Logger from "@server/logging/Logger";
import { Document, Team, User } from "@server/models";
import {
  CronTask,
  TaskInterval,
  type Props,
} from "@server/queues/tasks/base/CronTask";
import { TaskPriority } from "@server/queues/tasks/base/BaseTask";
import { Hour } from "@shared/utils/time";
import ArrowReviewAction from "@server/../plugins/arrow-approvals/server/models/ArrowReviewAction";
import ArrowReviewRequest from "@server/../plugins/arrow-approvals/server/models/ArrowReviewRequest";
import { sendReviewerDigestDM } from "../slack/digestSender";

/**
 * Sends a per-user Slack DM digest of:
 *   - specs awaiting their review (as reviewer), and
 *   - specs they authored that have stalled in changes_requested.
 *
 * Runs daily. Idempotency is provided by the (user, document, day) key
 * checked in `digestSender` before each send.
 *
 * Weekend skip and the configurable stalled-changes-threshold are checked
 * here so the cron task itself owns workspace-policy decisions.
 */
export default class DailyReviewRemindersTask extends CronTask {
  public async perform(_props: Props): Promise<void> {
    const now = new Date();
    const dayOfWeek = now.getUTCDay(); // 0=Sun, 6=Sat
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      Logger.info("task", "Skipping reminder digest — weekend");
      return;
    }

    const teams = await Team.findAll();
    for (const team of teams) {
      try {
        await this.processTeam(team);
      } catch (err) {
        Logger.error(`Reminder digest failed for team ${team.id}`, err as Error);
      }
    }
  }

  private async processTeam(team: Team): Promise<void> {
    // Reviewer digests — for every user in the team, find pending requests
    // where they're a required reviewer and haven't acted yet.
    const pending = await ArrowReviewRequest.findAll({
      where: { state: "pending" },
      include: [
        {
          model: Document,
          as: "document",
          where: { teamId: team.id },
          required: true,
        },
      ],
    });

    if (pending.length === 0) {
      return;
    }

    // For each pending request, identify who still owes a response.
    const userPendingMap = new Map<
      string,
      Array<{ request: ArrowReviewRequest; daysOld: number }>
    >();

    for (const request of pending) {
      const acted = await ArrowReviewAction.findAll({
        where: {
          requestId: request.id,
          action: { [Op.in]: ["approve", "request_changes"] },
        },
        attributes: ["userId"],
      });
      const actedUserIds = new Set(acted.map((a) => a.userId));
      const stillOwed = request.requiredReviewers.filter(
        (id) => !actedUserIds.has(id)
      );
      const ageMs = Date.now() - request.createdAt.getTime();
      const daysOld = Math.floor(ageMs / (1000 * 60 * 60 * 24));
      for (const userId of stillOwed) {
        const existing = userPendingMap.get(userId) ?? [];
        existing.push({ request, daysOld });
        userPendingMap.set(userId, existing);
      }
    }

    // Send a single DM per reviewer with their full list (oldest first).
    for (const [userId, entries] of userPendingMap.entries()) {
      const user = await User.findByPk(userId);
      if (!user) {
        continue;
      }
      entries.sort((a, b) => b.daysOld - a.daysOld);
      try {
        await sendReviewerDigestDM({ team, user, entries });
      } catch (err) {
        Logger.error(`reminder DM failed for ${user.email}`, err as Error);
      }
    }
  }

  public get cron() {
    return {
      interval: TaskInterval.Day,
      partitionWindow: Hour.ms,
    };
  }

  public get options() {
    return {
      attempts: 3,
      priority: TaskPriority.Background,
    };
  }
}
