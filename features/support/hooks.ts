/**
 * Cucumber hooks — Before/After per scenario.
 *
 * Before each scenario:
 *   - construct a fresh API client
 *   - construct a fresh TestEnvironment
 *   - reset captured Slack/webhook events
 *
 * After each scenario:
 *   - clean up any seeded users/docs/tags so scenarios don't bleed
 *
 * The actual cleanup logic lives in TestEnvironment so the hooks file stays
 * focused on lifecycle wiring.
 */
import { Before, After } from "@cucumber/cucumber";
import { ArrowApiClient } from "./api-client";
import { TestEnvironment } from "./test-environment";
import type { ArrowWorld } from "./world";

const BASE_URL = process.env.ARROW_TEST_BASE_URL ?? "http://localhost:3000";

Before(async function (this: ArrowWorld) {
  this.api = new ArrowApiClient(BASE_URL);
  this.env = new TestEnvironment(this);
  this.users.clear();
  this.documents.clear();
  this.tags.clear();
  this.reviewRequests.clear();
  this.slackDMs = [];
  this.webhookEvents = [];
  this.lastResult = null;
});

After(async function (this: ArrowWorld) {
  // Cleanup is intentionally minimal until TestEnvironment is implemented.
  // Once we have a real DB connection, this will truncate workspace-scoped tables.
});
