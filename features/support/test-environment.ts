/**
 * Test environment helpers — DB seeding, Slack mock, webhook recorder, clock.
 *
 * The BDD suite runs against a freshly-seeded local Outline instance. This
 * module owns the side-channel hooks that let step definitions:
 *   - create users + sign them in (returns API tokens)
 *   - capture Slack DMs that Outline tries to send (without actually hitting Slack)
 *   - capture webhook deliveries that Outline tries to make
 *   - control the clock for "X days ago" / "the daily reminder job runs at 09:00"
 *
 * In production this module will be implemented against the Outline test DB
 * + a small mock-Slack-and-webhook-collector running on an ephemeral port.
 *
 * For now the methods are stubs — they throw a descriptive error so that any
 * scenario that exercises them surfaces a clear "not implemented yet" message
 * and the BDD report shows where to fill in next.
 */
import type { ArrowWorld, SignedInUser } from "./world";

export class TestEnvironment {
  constructor(private readonly world: ArrowWorld) {}

  // ── DB / Workspace seeding ──────────────────────────────────────────────

  async ensureWorkspace(): Promise<void> {
    throw new Error(
      "TestEnvironment.ensureWorkspace not implemented — depends on Outline test DB setup"
    );
  }

  async createUser(args: {
    name: string;
    role: "admin" | "member" | "viewer";
  }): Promise<SignedInUser> {
    throw new Error(
      `TestEnvironment.createUser('${args.name}') not implemented — depends on Outline test DB setup`
    );
  }

  async setWorkspaceTimezone(_tz: string): Promise<void> {
    throw new Error("TestEnvironment.setWorkspaceTimezone not implemented");
  }

  async setWorkspaceSetting(_key: string, _value: unknown): Promise<void> {
    throw new Error("TestEnvironment.setWorkspaceSetting not implemented");
  }

  // ── Slack mock ──────────────────────────────────────────────────────────

  async enableSlackForUser(_userName: string): Promise<void> {
    throw new Error("TestEnvironment.enableSlackForUser not implemented");
  }

  async unlinkSlackForUser(_userName: string): Promise<void> {
    throw new Error("TestEnvironment.unlinkSlackForUser not implemented");
  }

  async simulateSlackError(_userName: string, _error: string): Promise<void> {
    throw new Error("TestEnvironment.simulateSlackError not implemented");
  }

  async simulateSlackRateLimit(_after: number): Promise<void> {
    throw new Error("TestEnvironment.simulateSlackRateLimit not implemented");
  }

  // ── Webhook recorder ────────────────────────────────────────────────────

  async registerWebhookSubscriber(_name: string, _eventName: string): Promise<void> {
    throw new Error("TestEnvironment.registerWebhookSubscriber not implemented");
  }

  // ── Clock control ───────────────────────────────────────────────────────

  /** Set the simulated "now" for the entire test run. */
  async setNow(_iso: string): Promise<void> {
    throw new Error("TestEnvironment.setNow not implemented");
  }

  /** Advance the simulated clock by `days`. */
  async advanceDays(_days: number): Promise<void> {
    throw new Error("TestEnvironment.advanceDays not implemented");
  }

  // ── Job triggers ────────────────────────────────────────────────────────

  /** Trigger the daily reminder job synchronously (so tests don't wait for cron). */
  async runDailyReminderJob(): Promise<void> {
    throw new Error("TestEnvironment.runDailyReminderJob not implemented");
  }
}
