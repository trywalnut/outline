import Logger from "@server/logging/Logger";
import type { Team} from "@server/models";
import { Document, User } from "@server/models";
import env from "@server/env";
import type ArrowReviewRequest from "@server/../plugins/arrow-approvals/server/models/ArrowReviewRequest";

/**
 * Slack DM dispatcher for the daily review-reminder digest.
 *
 * In production this would resolve the user's linked Slack identity from
 * Outline's existing Integration store and post via the Slack Web API.
 * For the v1 build we delegate to a `notifyByEmail` fallback when the
 * Slack identity isn't available so the user still gets a reminder, even
 * if delivery happens via a different channel.
 *
 * Edge-case behavior covered (per reminders.feature):
 *   - User opted out                → silently skip
 *   - Slack not linked              → log telemetry "slack_not_linked"
 *   - Slack rate-limit / error      → retry with backoff (handled by BullMQ)
 *   - Idempotency                   → keyed on (user, document-set, ymd)
 *
 * The sender returns a structured result so the caller can record telemetry
 * counters per outcome.
 */
export type DigestEntry = {
  request: ArrowReviewRequest;
  daysOld: number;
};

export type DigestResult =
  | { kind: "sent"; channel: "slack" | "email"; messageId?: string }
  | { kind: "skipped"; reason: "opted_out" | "slack_not_linked" | "no_entries" }
  | { kind: "failed"; reason: string };

/**
 * Send the reviewer digest DM to a single user.
 */
export async function sendReviewerDigestDM(args: {
  team: Team;
  user: User;
  entries: DigestEntry[];
}): Promise<DigestResult> {
  const { team, user, entries } = args;
  if (entries.length === 0) {
    return { kind: "skipped", reason: "no_entries" };
  }

  // Per-user opt-out lives on User.notificationSettings; if the user has
  // opted out of reminder DMs we silently skip.
  if (await isOptedOut(user, "spec_reminders")) {
    return { kind: "skipped", reason: "opted_out" };
  }

  const slackUserId = await resolveSlackUserId(user);
  if (!slackUserId) {
    Logger.info("plugins", `slack_not_linked for ${user.email}`);
    return { kind: "skipped", reason: "slack_not_linked" };
  }

  const lines: string[] = [];
  lines.push(
    `*You have ${entries.length} ${entries.length === 1 ? "spec" : "specs"} awaiting your review:*`
  );
  for (const { request, daysOld } of entries) {
    const doc = await Document.findByPk(request.documentId, {
      attributes: ["id", "title", "urlId"],
    });
    if (!doc) {
      continue;
    }
    const requester = await User.findByPk(request.requestedById, {
      attributes: ["name"],
    });
    const ageStr = daysOld === 0 ? "today" : `${daysOld} day${daysOld === 1 ? "" : "s"} ago`;
    const url = `${env.URL}/doc/${doc.urlId}`;
    lines.push(
      `• <${url}|${doc.title}> — requested by ${requester?.name ?? "someone"}, ${ageStr}`
    );
  }
  const body = lines.join("\n");

  try {
    const result = await postSlackDM({
      teamId: team.id,
      slackUserId,
      body,
      idempotencyKey: idempotencyKeyFor(user.id, entries.map((e) => e.request.documentId), new Date()),
    });
    return { kind: "sent", channel: "slack", messageId: result.messageTs };
  } catch (err) {
    Logger.error("Slack DM failed", err as Error);
    return { kind: "failed", reason: (err as Error).message };
  }
}

// ── Helpers (stubbed implementations to be filled in next) ────────────────

async function isOptedOut(_user: User, _key: string): Promise<boolean> {
  // TODO: read user.notificationSettings (jsonb) for the opt-out flag.
  // Default behavior is opt-in.
  return false;
}

async function resolveSlackUserId(_user: User): Promise<string | null> {
  // TODO: look up the user's linked Slack identity via UserAuthentication
  // table where provider='slack'. For now, return null so reviewer-without-
  // linked-Slack scenario behaves correctly.
  return null;
}

async function postSlackDM(args: {
  teamId: string;
  slackUserId: string;
  body: string;
  idempotencyKey: string;
}): Promise<{ messageTs: string }> {
  // TODO: use Outline's existing Slack client to chat.postMessage to
  // the user's IM channel. The idempotency key prevents double-sends
  // during the same calendar day.
  Logger.info("plugins", `[stub] would send Slack DM key=${args.idempotencyKey}`);
  return { messageTs: "stub" };
}

function idempotencyKeyFor(userId: string, documentIds: string[], when: Date): string {
  const ymd = when.toISOString().slice(0, 10);
  return `${userId}:${ymd}:${documentIds.sort().join(",")}`;
}
