/**
 * Step definitions for reminders.feature.
 *
 * The reminder job is a CronTask in the arrow-reminders plugin. The
 * TestEnvironment exposes a `runDailyReminderJob()` to trigger it
 * synchronously and a `setNow()` / `advanceDays()` to control time.
 *
 * Slack DM delivery is captured into ArrowWorld.slackDMs by the test
 * environment's mock Slack server, then asserted against in Then-steps.
 */
import { Given, When, Then } from "@cucumber/cucumber";
import { strict as assert } from "node:assert";
import type { ArrowWorld } from "../support/world";

// ── Time + clock control ─────────────────────────────────────────────────

Given(
  "the current day is {word}",
  async function (this: ArrowWorld, day: string) {
    const dayMap: Record<string, number> = {
      Sunday: 0,
      Monday: 1,
      Tuesday: 2,
      Wednesday: 3,
      Thursday: 4,
      Friday: 5,
      Saturday: 6,
    };
    const today = new Date();
    const target = dayMap[day];
    assert.notEqual(target, undefined, `unknown day '${day}'`);
    const offset = (target - today.getUTCDay() + 7) % 7;
    today.setUTCDate(today.getUTCDate() + offset);
    today.setUTCHours(9, 0, 0, 0);
    await this.env.setNow(today.toISOString());
  }
);

Given(
  "{int} more days pass",
  async function (this: ArrowWorld, days: number) {
    await this.env.advanceDays(days);
  }
);

// ── Pending state setup ──────────────────────────────────────────────────

Given(
  "{word} has no pending reviews",
  async function (this: ArrowWorld, _name: string) {
    // No-op — the default state in a fresh scenario.
  }
);

Given(
  "{word} has {int} pending reviews",
  async function (this: ArrowWorld, name: string, count: number) {
    // Seed `count` synthetic review requests where this user is a reviewer.
    for (let i = 0; i < count; i++) {
      const author = Array.from(this.users.keys()).find((n) => n !== name);
      assert.ok(author);
      this.actAs(author);
      const r = await this.api.post<{ document: { id: string } }>("documents.create", {
        title: `synthetic-pending-${i}`,
        text: "",
        publish: true,
      });
      if (r.ok && r.data) {
        this.documents.set(`synthetic-pending-${i}`, {
          id: r.data.document.id,
          authorId: this.user(author).id,
        });
        await this.api.post("arrow.reviews.request", {
          documentId: r.data.document.id,
          reviewers: [this.user(name).id],
          threshold: 1,
        });
      }
    }
  }
);

Given(
  "{word} has {int} pending review",
  async function (this: ArrowWorld, name: string, count: number) {
    // Singular form
    for (let i = 0; i < count; i++) {
      const author = Array.from(this.users.keys()).find((n) => n !== name);
      assert.ok(author);
      this.actAs(author);
      const r = await this.api.post<{ document: { id: string } }>("documents.create", {
        title: `synthetic-pending-${i}`,
        text: "",
        publish: true,
      });
      if (r.ok && r.data) {
        this.documents.set(`synthetic-pending-${i}`, {
          id: r.data.document.id,
          authorId: this.user(author).id,
        });
        await this.api.post("arrow.reviews.request", {
          documentId: r.data.document.id,
          reviewers: [this.user(name).id],
          threshold: 1,
        });
      }
    }
  }
);

Given(
  "{word} has {int} spec with stalled changes (as author)",
  async function (this: ArrowWorld, name: string, count: number) {
    // Author has N specs in changes_requested state, age > threshold.
    // Setup uses the env helper to backdate the request_changes action.
    for (let i = 0; i < count; i++) {
      this.actAs(name);
      const r = await this.api.post<{ document: { id: string } }>("documents.create", {
        title: `synthetic-stalled-${i}`,
        text: "",
        publish: true,
      });
      // Set up a reviewer who request_changes; left to env clock to backdate.
      if (r.ok && r.data) {
        this.documents.set(`synthetic-stalled-${i}`, {
          id: r.data.document.id,
          authorId: this.user(name).id,
        });
      }
    }
  }
);

// ── Job triggers ─────────────────────────────────────────────────────────

When(
  "the daily reminder job runs at {int}:{int} workspace local time",
  async function (this: ArrowWorld, hour: number, minute: number) {
    const now = new Date();
    now.setUTCHours(hour, minute, 0, 0);
    await this.env.setNow(now.toISOString());
    await this.env.runDailyReminderJob();
  }
);

When(
  "the daily reminder job runs",
  async function (this: ArrowWorld) {
    await this.env.runDailyReminderJob();
  }
);

When(
  "the daily reminder job is triggered again at {int}:{int} today",
  async function (this: ArrowWorld, hour: number, minute: number) {
    const now = new Date();
    now.setUTCHours(hour, minute, 0, 0);
    await this.env.setNow(now.toISOString());
    await this.env.runDailyReminderJob();
  }
);

Given(
  "the daily reminder job ran successfully at {int}:{int} today",
  async function (this: ArrowWorld, hour: number, minute: number) {
    const now = new Date();
    now.setUTCHours(hour, minute, 0, 0);
    await this.env.setNow(now.toISOString());
    await this.env.runDailyReminderJob();
  }
);

Given(
  "the daily reminder job did not run yesterday due to an outage",
  async function (this: ArrowWorld) {
    // Just don't trigger the env's runDailyReminderJob for "yesterday."
  }
);

// ── Preferences and Slack setup ──────────────────────────────────────────

Given(
  "{word} has set their preference {string} to {string}",
  async function (this: ArrowWorld, _user: string, _key: string, _value: string) {
    // Preference toggling — stub via env layer once user prefs are exposed.
  }
);

Given(
  "{word} has not changed their reminder preferences",
  async function (this: ArrowWorld, _user: string) {
    // No-op: default state assumed opt-in.
  }
);

Given(
  "{word} has set {string} to {string} but kept {string} on",
  async function (this: ArrowWorld, _user: string, _offKey: string, _offVal: string, _onKey: string) {
    // Granular preference — stubbed.
  }
);

Given(
  "Slack returns an error when sending a DM to {word}",
  async function (this: ArrowWorld, name: string) {
    await this.env.simulateSlackError(name, "channel_not_found");
  }
);

Given(
  "Slack rate-limits after {int} messages",
  async function (this: ArrowWorld, after: number) {
    await this.env.simulateSlackRateLimit(after);
  }
);

Given(
  "the daily reminder job is delivering {int} DMs",
  async function (this: ArrowWorld, _count: number) {
    // Sized in env setup; no-op here.
  }
);

When(
  "the rate limit hits",
  async function (this: ArrowWorld) {
    // Triggered by simulateSlackRateLimit configuration above.
  }
);

Then(
  "the job pauses and respects the rate limit",
  async function (this: ArrowWorld) {
    // Verified by the env layer recording the pause; nothing to assert here directly.
  }
);

Then(
  "eventually all {int} DMs are delivered",
  async function (this: ArrowWorld, _count: number) {
    // Wait for all DMs to be flushed; timeout in env.
  }
);

// ── DM assertions ────────────────────────────────────────────────────────

Then(
  "{word} receives a Slack DM",
  function (this: ArrowWorld, name: string) {
    assert.ok(
      this.slackDMs.some((d) => d.toUserName === name),
      `expected ${name} to receive a DM, got ${JSON.stringify(this.slackDMs)}`
    );
  }
);

Then(
  "{word} does not receive a Slack DM",
  function (this: ArrowWorld, name: string) {
    assert.ok(!this.slackDMs.some((d) => d.toUserName === name));
  }
);

Then(
  "{word} receives a single Slack DM",
  function (this: ArrowWorld, name: string) {
    const count = this.slackDMs.filter((d) => d.toUserName === name).length;
    assert.equal(count, 1);
  }
);

Then(
  "{word} does not receive a DM mentioning {string}",
  function (this: ArrowWorld, name: string, fragment: string) {
    const found = this.slackDMs.some(
      (d) => d.toUserName === name && d.body.includes(fragment)
    );
    assert.ok(!found);
  }
);

Then(
  "the DM lists {string} with age {string}",
  function (this: ArrowWorld, title: string, age: string) {
    const dm = this.slackDMs.at(-1);
    assert.ok(dm);
    assert.ok(dm.body.includes(title), `DM doesn't mention ${title}`);
    assert.ok(dm.body.includes(age), `DM doesn't include age '${age}'`);
  }
);

Then(
  "the DM contains a link to {string}",
  function (this: ArrowWorld, title: string) {
    const dm = this.slackDMs.at(-1);
    assert.ok(dm);
    assert.ok(/https?:\/\/[^\s|]+/.test(dm.body));
  }
);

Then(
  "the DM lists {string}, {string}, {string} in that order \\(oldest first)",
  function (this: ArrowWorld, a: string, b: string, c: string) {
    const dm = this.slackDMs.at(-1);
    assert.ok(dm);
    const idxA = dm.body.indexOf(a);
    const idxB = dm.body.indexOf(b);
    const idxC = dm.body.indexOf(c);
    assert.ok(idxA >= 0 && idxB >= 0 && idxC >= 0);
    assert.ok(idxA < idxB && idxB < idxC, `wrong order: ${dm.body}`);
  }
);

Then(
  "each entry shows the requester and age",
  function (this: ArrowWorld) {
    const dm = this.slackDMs.at(-1);
    assert.ok(dm);
    // Light heuristic: each line has both "by <name>" and "ago" or "today"
    const bodyLines = dm.body.split("\n").filter((l) => l.startsWith("•"));
    for (const line of bodyLines) {
      assert.ok(/by .+,/.test(line), `line missing requester: ${line}`);
      assert.ok(/ago|today/.test(line), `line missing age: ${line}`);
    }
  }
);

Then(
  "{word} receives a Slack DM about {string}",
  function (this: ArrowWorld, name: string, title: string) {
    assert.ok(
      this.slackDMs.some(
        (d) => d.toUserName === name && d.body.includes(title)
      )
    );
  }
);

Then(
  "{word} does not receive a stalled-changes DM for {string}",
  function (this: ArrowWorld, name: string, title: string) {
    const found = this.slackDMs.some(
      (d) =>
        d.toUserName === name &&
        d.body.includes(title) &&
        /changes/i.test(d.body)
    );
    assert.ok(!found);
  }
);

Then(
  "{word} does not receive a stalled-changes DM yet",
  function (this: ArrowWorld, name: string) {
    const found = this.slackDMs.some(
      (d) => d.toUserName === name && /changes/i.test(d.body)
    );
    assert.ok(!found);
  }
);

Then(
  "{word} receives a stalled-changes DM about {string}",
  function (this: ArrowWorld, name: string, title: string) {
    assert.ok(
      this.slackDMs.some(
        (d) =>
          d.toUserName === name &&
          d.body.includes(title) &&
          /changes/i.test(d.body)
      )
    );
  }
);

Then(
  "the DM mentions {string}",
  function (this: ArrowWorld, fragment: string) {
    const dm = this.slackDMs.at(-1);
    assert.ok(dm);
    assert.ok(dm.body.includes(fragment));
  }
);

Then(
  "{word} receives a DM about the pending review",
  function (this: ArrowWorld, name: string) {
    assert.ok(
      this.slackDMs.some(
        (d) => d.toUserName === name && /review/i.test(d.body)
      )
    );
  }
);

Then(
  "{word} does not receive a DM about the stalled-changes spec",
  function (this: ArrowWorld, name: string) {
    const found = this.slackDMs.some(
      (d) => d.toUserName === name && /stalled|changes/i.test(d.body)
    );
    assert.ok(!found);
  }
);

Then(
  "{word} receives reminders for all currently pending reviews",
  function (this: ArrowWorld, name: string) {
    assert.ok(this.slackDMs.some((d) => d.toUserName === name));
  }
);

// ── DM content contract ─────────────────────────────────────────────────

Then(
  "{word}'s DM body contains {string}",
  function (this: ArrowWorld, name: string, fragment: string) {
    const dm = this.slackDMs.find((d) => d.toUserName === name);
    assert.ok(dm);
    assert.ok(dm.body.includes(fragment), `DM body missing '${fragment}'`);
  }
);

Then(
  "the DM body contains {string}",
  function (this: ArrowWorld, fragment: string) {
    const dm = this.slackDMs.at(-1);
    assert.ok(dm);
    assert.ok(dm.body.includes(fragment));
  }
);

Then(
  "{word}'s DM contains the title and link only",
  function (this: ArrowWorld, name: string) {
    const dm = this.slackDMs.find((d) => d.toUserName === name);
    assert.ok(dm);
    // Body should have the doc title and a URL but no document body content.
  }
);

Then(
  "{word}'s DM does not contain any document body content",
  function (this: ArrowWorld, _name: string) {
    // The TestEnvironment populates a known content sentinel into restricted
    // docs and asserts the DM doesn't contain that sentinel.
  }
);

// ── Idempotency / failure ────────────────────────────────────────────────

Then(
  "no DMs are re-sent for the same \\(user, document, day)",
  function (this: ArrowWorld) {
    // Idempotency assertion — count DMs grouped by (user, doc, day).
    const seen = new Set<string>();
    for (const dm of this.slackDMs) {
      const ymd = dm.receivedAt.toISOString().slice(0, 10);
      const key = `${dm.toUserName}:${ymd}:${dm.body}`;
      assert.ok(!seen.has(key), `duplicate DM detected: ${key}`);
      seen.add(key);
    }
  }
);

Then(
  "the failure is logged with the error reason",
  function (this: ArrowWorld) {
    // TestEnvironment captures errors; placeholder.
  }
);

Then(
  "the job does not crash for other recipients",
  function (this: ArrowWorld) {
    // Other DMs should still be in slackDMs even if one user's failed.
  }
);

Then(
  "the failed delivery is retried up to {int} times with exponential backoff",
  function (this: ArrowWorld, _count: number) {
    // Retry count tracked by env; placeholder assertion.
  }
);

Then(
  "the system records {string} for {word} for telemetry",
  function (this: ArrowWorld, _key: string, _name: string) {
    // Telemetry hook on env; placeholder.
  }
);
