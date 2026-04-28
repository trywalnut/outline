/**
 * Step definitions shared across all features — workspace setup, users,
 * generic assertions about the last API result.
 *
 * These steps appear in every Background or are referenced widely. Anything
 * specific to tags, approvals, or reminders lives in its own step file.
 */
import { Given, Then } from "@cucumber/cucumber";
import { strict as assert } from "node:assert";
import type { ArrowWorld } from "../support/world";

// ── Workspace ─────────────────────────────────────────────────────────────

Given("the Arrow workspace exists", async function (this: ArrowWorld) {
  await this.env.ensureWorkspace();
});

Given(
  "the workspace timezone is {string}",
  async function (this: ArrowWorld, tz: string) {
    await this.env.setWorkspaceTimezone(tz);
  }
);

Given(
  'the workspace setting {string} is {int}',
  async function (this: ArrowWorld, key: string, value: number) {
    await this.env.setWorkspaceSetting(key, value);
  }
);

Given(
  "Slack notifications are configured",
  async function (this: ArrowWorld) {
    // Slack at the workspace level is configured; per-user enable comes in its own step.
    // No-op as long as the test environment was bootstrapped with Slack creds.
  }
);

// ── Users ─────────────────────────────────────────────────────────────────

Given(
  'a user {string} with role {string} is signed in',
  async function (this: ArrowWorld, name: string, role: string) {
    if (!["admin", "member", "viewer"].includes(role)) {
      throw new Error(`Unknown role: ${role}`);
    }
    const user = await this.env.createUser({ name, role: role as "admin" | "member" | "viewer" });
    this.users.set(name, user);
  }
);

Given(
  'a user {string} exists',
  async function (this: ArrowWorld, name: string) {
    const user = await this.env.createUser({ name, role: "member" });
    this.users.set(name, user);
  }
);

Given(
  'a user {string} with Slack DMs enabled exists',
  async function (this: ArrowWorld, name: string) {
    const user = await this.env.createUser({ name, role: "member" });
    this.users.set(name, user);
    await this.env.enableSlackForUser(name);
  }
);

Given(
  '{word} has Slack notifications enabled',
  async function (this: ArrowWorld, name: string) {
    await this.env.enableSlackForUser(name);
  }
);

Given(
  '{word} has no Slack identity linked to their Arrow account',
  async function (this: ArrowWorld, name: string) {
    await this.env.unlinkSlackForUser(name);
  }
);

// ── Generic assertions on the last API result ────────────────────────────

Then(
  'the request is rejected with reason {string}',
  function (this: ArrowWorld, expectedReason: string) {
    assert.ok(this.lastResult, "no API call has been made yet");
    assert.equal(
      this.lastResult.ok,
      false,
      `expected request to be rejected, but it succeeded (status ${this.lastResult.status})`
    );
    assert.equal(
      this.lastResult.reason,
      expectedReason,
      `expected reason '${expectedReason}', got '${this.lastResult.reason}'`
    );
  }
);

// ── Webhook subscribers ──────────────────────────────────────────────────

Given(
  'a webhook subscriber {string} is registered for {string}',
  async function (this: ArrowWorld, name: string, eventName: string) {
    await this.env.registerWebhookSubscriber(name, eventName);
  }
);

Then(
  '{string} receives a {string} event',
  function (this: ArrowWorld, subscriberName: string, eventName: string) {
    const matches = this.webhookEvents.filter(
      (e) => e.subscriberName === subscriberName && e.eventName === eventName
    );
    assert.ok(
      matches.length >= 1,
      `expected '${subscriberName}' to receive '${eventName}', got ${JSON.stringify(this.webhookEvents)}`
    );
  }
);

Then(
  '{string} receives an {string} event with the documentId and reviewer ids',
  function (this: ArrowWorld, subscriberName: string, eventName: string) {
    const matches = this.webhookEvents.filter(
      (e) => e.subscriberName === subscriberName && e.eventName === eventName
    );
    assert.ok(matches.length >= 1, `expected event '${eventName}' to be delivered`);
    const payload = matches[0].payload;
    assert.ok(payload.documentId, "expected payload to include documentId");
    assert.ok(Array.isArray(payload.reviewerIds), "expected payload to include reviewerIds");
  }
);

Then(
  '{string} receives an {string} event with the documentId and revisionId',
  function (this: ArrowWorld, subscriberName: string, eventName: string) {
    const matches = this.webhookEvents.filter(
      (e) => e.subscriberName === subscriberName && e.eventName === eventName
    );
    assert.ok(matches.length >= 1, `expected event '${eventName}' to be delivered`);
    const payload = matches[0].payload;
    assert.ok(payload.documentId, "expected payload to include documentId");
    assert.ok(payload.revisionId, "expected payload to include revisionId");
  }
);

Then(
  'the event payload includes documentId, tagId, and userId for {word}',
  function (this: ArrowWorld, userName: string) {
    const last = this.webhookEvents[this.webhookEvents.length - 1];
    assert.ok(last, "no webhook events captured");
    const u = this.user(userName);
    assert.ok(last.payload.documentId, "missing documentId");
    assert.ok(last.payload.tagId, "missing tagId");
    assert.equal(last.payload.userId, u.id, "userId mismatch");
  }
);
