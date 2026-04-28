/**
 * Cucumber World — shared state across step definitions for a single scenario.
 *
 * The World holds the API client, fixtures (created users, docs, tags, etc),
 * and any captured side effects (delivered Slack DMs, fired webhooks) so that
 * Then-steps can assert against them.
 *
 * Each scenario gets a fresh World; nothing leaks between scenarios.
 */
import { setWorldConstructor, World, IWorldOptions } from "@cucumber/cucumber";
import { ArrowApiClient } from "./api-client";
import { TestEnvironment } from "./test-environment";

export interface SignedInUser {
  id: string;
  name: string;
  email: string;
  role: "admin" | "member" | "viewer";
  apiToken: string;
}

export interface CapturedSlackDM {
  toUserName: string;
  body: string;
  receivedAt: Date;
}

export interface CapturedWebhookEvent {
  subscriberName: string;
  eventName: string;
  payload: Record<string, unknown>;
  receivedAt: Date;
}

export class ArrowWorld extends World {
  /** Per-scenario API client (rotates per signed-in user). */
  api!: ArrowApiClient;

  /** Test environment — DB, Slack mock, webhook recorder, clock. */
  env!: TestEnvironment;

  /** Users by name (e.g. "Yash" -> SignedInUser). */
  users = new Map<string, SignedInUser>();

  /** Currently acting user — `When` steps act as this user. */
  actingAs: SignedInUser | null = null;

  /** Documents by title (the test's natural key). */
  documents = new Map<string, { id: string; authorId: string }>();

  /** Tags by name. */
  tags = new Map<string, { id: string; color: string }>();

  /** Review requests keyed by document id. */
  reviewRequests = new Map<
    string,
    {
      id: string;
      requestedByUserId: string;
      requiredReviewers: string[];
      threshold: number;
      state: "pending" | "approved" | "changes_requested" | "cancelled";
    }
  >();

  /** Last API result (for negative assertions like "request was rejected with reason"). */
  lastResult: { ok: boolean; status: number; data?: unknown; reason?: string } | null = null;

  /** Captured Slack DMs across the scenario. */
  slackDMs: CapturedSlackDM[] = [];

  /** Captured webhook deliveries. */
  webhookEvents: CapturedWebhookEvent[] = [];

  constructor(options: IWorldOptions) {
    super(options);
  }

  /**
   * Switch the acting user — subsequent API calls use their token.
   */
  actAs(name: string): void {
    const user = this.users.get(name);
    if (!user) {
      throw new Error(`User "${name}" has not been set up in this scenario`);
    }
    this.actingAs = user;
    this.api.setToken(user.apiToken);
  }

  /**
   * Look up a user by name; throws if not set up.
   */
  user(name: string): SignedInUser {
    const u = this.users.get(name);
    if (!u) {
      throw new Error(`User "${name}" has not been set up in this scenario`);
    }
    return u;
  }

  /**
   * Look up a document by title.
   */
  document(title: string): { id: string; authorId: string } {
    const d = this.documents.get(title);
    if (!d) {
      throw new Error(`Document "${title}" has not been created in this scenario`);
    }
    return d;
  }

  /**
   * Look up a tag by name.
   */
  tag(name: string): { id: string; color: string } {
    const t = this.tags.get(name);
    if (!t) {
      throw new Error(`Tag "${name}" has not been created in this scenario`);
    }
    return t;
  }
}

setWorldConstructor(ArrowWorld);
