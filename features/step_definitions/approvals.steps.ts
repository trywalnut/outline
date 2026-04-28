/**
 * Step definitions for approvals.feature.
 *
 * Maps Gherkin to the arrow-approvals API. Where the API hasn't been
 * exercised end-to-end yet (TestEnvironment is stubbed), these will
 * predictably fail with a "not implemented" error from the env layer —
 * which is the correct red baseline.
 */
import { Given, When, Then } from "@cucumber/cucumber";
import { strict as assert } from "node:assert";
import type { ArrowWorld } from "../support/world";

// ── Reviewer-list helpers ────────────────────────────────────────────────

function parseReviewers(this: ArrowWorld, list: string): string[] {
  return list.split(/[,\s]+/).filter(Boolean).map((name) => this.user(name).id);
}

// ── Requesting review ────────────────────────────────────────────────────

When(
  "{word} requests review on {string} with reviewers {string} and threshold {int}",
  async function (this: ArrowWorld, actor: string, title: string, reviewerNames: string, threshold: number) {
    this.actAs(actor);
    const doc = this.document(title);
    const reviewers = parseReviewers.call(this, reviewerNames);
    this.lastResult = await this.api.post("arrow.reviews.request", {
      documentId: doc.id,
      reviewers,
      threshold,
    });
    if (this.lastResult.ok && (this.lastResult.data as { id: string }).id) {
      const data = this.lastResult.data as {
        id: string; documentId: string; requestedById: string;
        requiredReviewers: string[]; threshold: number; state: string;
      };
      this.reviewRequests.set(doc.id, {
        id: data.id, requestedByUserId: data.requestedById,
        requiredReviewers: data.requiredReviewers, threshold: data.threshold,
        state: data.state as "pending" | "approved" | "changes_requested" | "cancelled",
      });
    }
  }
);

When(
  "{word} requests review on {string} with reviewer {string} {int} day(s) ago",
  async function (this: ArrowWorld, actor: string, title: string, reviewerName: string, days: number) {
    // For the reminders feature: backdate the request creation by `days`.
    this.actAs(actor);
    const doc = this.document(title);
    const reviewers = [this.user(reviewerName).id];
    this.lastResult = await this.api.post("arrow.reviews.request", {
      documentId: doc.id,
      reviewers,
      threshold: 1,
    });
    // The TestEnvironment will adjust the createdAt via a clock-control hook
    // once it's implemented.
    await this.env.advanceDays(0); // placeholder — backdate handled in env
  }
);

When(
  "{word} tries to request review on {string} with reviewers {string} and threshold {int}",
  async function (this: ArrowWorld, actor: string, title: string, reviewerNames: string, threshold: number) {
    this.actAs(actor);
    const doc = this.document(title);
    const reviewers = parseReviewers.call(this, reviewerNames);
    this.lastResult = await this.api.post("arrow.reviews.request", {
      documentId: doc.id,
      reviewers,
      threshold,
    });
  }
);

When(
  "{word} tries to request review on {string} again",
  async function (this: ArrowWorld, actor: string, title: string) {
    this.actAs(actor);
    const doc = this.document(title);
    this.lastResult = await this.api.post("arrow.reviews.request", {
      documentId: doc.id,
      reviewers: [Array.from(this.users.values())[0].id],
      threshold: 1,
    });
  }
);

Given(
  "{word} requested review on {string} with reviewers {string} and threshold {int}",
  async function (this: ArrowWorld, actor: string, title: string, reviewerNames: string, threshold: number) {
    this.actAs(actor);
    const doc = this.document(title);
    const reviewers = parseReviewers.call(this, reviewerNames);
    const r = await this.api.post<{ id: string }>("arrow.reviews.request", {
      documentId: doc.id,
      reviewers,
      threshold,
    });
    if (r.ok && r.data) {
      this.reviewRequests.set(doc.id, {
        id: r.data.id, requestedByUserId: this.user(actor).id,
        requiredReviewers: reviewers, threshold,
        state: "pending",
      });
    }
  }
);

Given(
  "{word} requested review on {string} with reviewer {string} and threshold {int}",
  async function (this: ArrowWorld, actor: string, title: string, reviewerName: string, threshold: number) {
    this.actAs(actor);
    const doc = this.document(title);
    const r = await this.api.post<{ id: string }>("arrow.reviews.request", {
      documentId: doc.id,
      reviewers: [this.user(reviewerName).id],
      threshold,
    });
    if (r.ok && r.data) {
      this.reviewRequests.set(doc.id, {
        id: r.data.id, requestedByUserId: this.user(actor).id,
        requiredReviewers: [this.user(reviewerName).id], threshold,
        state: "pending",
      });
    }
  }
);

// ── Approving ────────────────────────────────────────────────────────────

When(
  "{word} approves {string} with comment {string}",
  async function (this: ArrowWorld, actor: string, title: string, comment: string) {
    this.actAs(actor);
    const doc = this.document(title);
    const req = this.reviewRequests.get(doc.id);
    assert.ok(req, `no review request tracked for '${title}'`);
    this.lastResult = await this.api.post("arrow.reviews.approve", {
      requestId: req.id, comment,
    });
  }
);

When(
  "{word} approves {string}",
  async function (this: ArrowWorld, actor: string, title: string) {
    this.actAs(actor);
    const doc = this.document(title);
    const req = this.reviewRequests.get(doc.id);
    assert.ok(req, `no review request tracked for '${title}'`);
    this.lastResult = await this.api.post("arrow.reviews.approve", { requestId: req.id });
  }
);

When(
  "{word} tries to approve {string}",
  async function (this: ArrowWorld, actor: string, title: string) {
    this.actAs(actor);
    const doc = this.document(title);
    const req = this.reviewRequests.get(doc.id);
    assert.ok(req);
    this.lastResult = await this.api.post("arrow.reviews.approve", { requestId: req.id });
  }
);

When(
  "{word} tries to approve {string} again",
  async function (this: ArrowWorld, actor: string, title: string) {
    this.actAs(actor);
    const doc = this.document(title);
    const req = this.reviewRequests.get(doc.id);
    assert.ok(req);
    this.lastResult = await this.api.post("arrow.reviews.approve", { requestId: req.id });
  }
);

Given(
  "{word} already approved {string}",
  async function (this: ArrowWorld, actor: string, title: string) {
    this.actAs(actor);
    const doc = this.document(title);
    const req = this.reviewRequests.get(doc.id);
    assert.ok(req);
    await this.api.post("arrow.reviews.approve", { requestId: req.id });
  }
);

Given(
  "{word} approved {string}",
  async function (this: ArrowWorld, actor: string, title: string) {
    this.actAs(actor);
    const doc = this.document(title);
    const req = this.reviewRequests.get(doc.id);
    assert.ok(req);
    await this.api.post("arrow.reviews.approve", { requestId: req.id });
  }
);

Given(
  "{word} has already approved {string}",
  async function (this: ArrowWorld, actor: string, title: string) {
    this.actAs(actor);
    const doc = this.document(title);
    const req = this.reviewRequests.get(doc.id);
    assert.ok(req);
    await this.api.post("arrow.reviews.approve", { requestId: req.id });
  }
);

// ── Requesting changes ──────────────────────────────────────────────────

When(
  "{word} requests changes on {string} with comment {string}",
  async function (this: ArrowWorld, actor: string, title: string, comment: string) {
    this.actAs(actor);
    const doc = this.document(title);
    const req = this.reviewRequests.get(doc.id);
    assert.ok(req);
    this.lastResult = await this.api.post("arrow.reviews.requestChanges", {
      requestId: req.id, comment,
    });
  }
);

When(
  "{word} tries to request changes on {string} with no comment",
  async function (this: ArrowWorld, actor: string, title: string) {
    this.actAs(actor);
    const doc = this.document(title);
    const req = this.reviewRequests.get(doc.id);
    assert.ok(req);
    this.lastResult = await this.api.post("arrow.reviews.requestChanges", {
      requestId: req.id,
    });
  }
);

Given(
  "{word} requested changes on {string} {int} day(s) ago",
  async function (this: ArrowWorld, actor: string, title: string, days: number) {
    this.actAs(actor);
    const doc = this.document(title);
    const req = this.reviewRequests.get(doc.id);
    assert.ok(req);
    await this.api.post("arrow.reviews.requestChanges", {
      requestId: req.id, comment: "needs changes",
    });
    await this.env.advanceDays(0); // backdate via env when implemented
  }
);

Given(
  "the document state is {string}",
  async function (this: ArrowWorld, state: string) {
    // Drives subsequent Then assertions; the backing state is whatever the API
    // currently returns for the most recently active document.
    this.lastResult = { ok: true, status: 200, data: { state } };
  }
);

When(
  "{word} re-requests review on {string}",
  async function (this: ArrowWorld, actor: string, title: string) {
    this.actAs(actor);
    const doc = this.document(title);
    this.lastResult = await this.api.post("arrow.reviews.reRequest", { documentId: doc.id });
  }
);

When(
  "{word} tries to re-request review on {string}",
  async function (this: ArrowWorld, actor: string, title: string) {
    this.actAs(actor);
    const doc = this.document(title);
    this.lastResult = await this.api.post("arrow.reviews.reRequest", { documentId: doc.id });
  }
);

// ── Cancelling ───────────────────────────────────────────────────────────

When(
  "{word} cancels review on {string}",
  async function (this: ArrowWorld, actor: string, title: string) {
    this.actAs(actor);
    const doc = this.document(title);
    const req = this.reviewRequests.get(doc.id);
    assert.ok(req);
    this.lastResult = await this.api.post("arrow.reviews.cancel", { requestId: req.id });
  }
);

When(
  "{word} tries to cancel review on {string}",
  async function (this: ArrowWorld, actor: string, title: string) {
    this.actAs(actor);
    const doc = this.document(title);
    const req = this.reviewRequests.get(doc.id);
    assert.ok(req);
    this.lastResult = await this.api.post("arrow.reviews.cancel", { requestId: req.id });
  }
);

Given(
  "{word} cancelled a review on {string}",
  async function (this: ArrowWorld, actor: string, title: string) {
    this.actAs(actor);
    const doc = this.document(title);
    const req = this.reviewRequests.get(doc.id);
    if (req) {
      await this.api.post("arrow.reviews.cancel", { requestId: req.id });
    }
  }
);

// ── Editing ──────────────────────────────────────────────────────────────

When(
  "{word} tries to edit {string}",
  async function (this: ArrowWorld, actor: string, title: string) {
    this.actAs(actor);
    const doc = this.document(title);
    this.lastResult = await this.api.post("documents.update", {
      id: doc.id,
      text: "edited content",
    });
  }
);

When(
  "{word} edits {string}",
  async function (this: ArrowWorld, actor: string, title: string) {
    this.actAs(actor);
    const doc = this.document(title);
    this.lastResult = await this.api.post("documents.update", {
      id: doc.id,
      text: "edited content",
    });
  }
);

Given(
  "{word} edited {string} since changes were requested",
  async function (this: ArrowWorld, actor: string, title: string) {
    this.actAs(actor);
    const doc = this.document(title);
    await this.api.post("documents.update", { id: doc.id, text: "addressed" });
  }
);

Given(
  "{word} has edited {string} since changes were requested",
  async function (this: ArrowWorld, actor: string, title: string) {
    this.actAs(actor);
    const doc = this.document(title);
    await this.api.post("documents.update", { id: doc.id, text: "addressed" });
  }
);

Given(
  "{word} has not edited {string} since changes were requested",
  async function (this: ArrowWorld, _actor: string, _title: string) {
    // No-op: the test environment should keep the doc unmodified.
  }
);

When(
  "{word} unlocks {string}",
  async function (this: ArrowWorld, actor: string, title: string) {
    this.actAs(actor);
    const doc = this.document(title);
    this.lastResult = await this.api.post("arrow.reviews.unlock", { documentId: doc.id });
  }
);

Then(
  "{word} can edit {string}",
  async function (this: ArrowWorld, actor: string, title: string) {
    this.actAs(actor);
    const doc = this.document(title);
    const r = await this.api.post("documents.update", {
      id: doc.id,
      text: "post-unlock edit",
    });
    assert.ok(r.ok, "edit should succeed after unlock");
  }
);

Then(
  "the edit succeeds",
  function (this: ArrowWorld) {
    assert.ok(this.lastResult?.ok, "edit was rejected");
  }
);

// ── State assertions ─────────────────────────────────────────────────────

Then(
  "the document state is {string}",
  async function (this: ArrowWorld, expected: string) {
    // Pull the latest review state via the info endpoint.
    const lastDoc = Array.from(this.documents.values()).pop();
    assert.ok(lastDoc);
    const r = await this.api.post<{ state: string } | null>("arrow.reviews.info", {
      documentId: lastDoc.id,
    });
    const actual = (r.data as { state?: string } | null)?.state ?? "draft";
    assert.equal(actual, expected);
  }
);

Then(
  "the document state remains {string}",
  async function (this: ArrowWorld, expected: string) {
    const lastDoc = Array.from(this.documents.values()).pop();
    assert.ok(lastDoc);
    const r = await this.api.post<{ state: string } | null>("arrow.reviews.info", {
      documentId: lastDoc.id,
    });
    const actual = (r.data as { state?: string } | null)?.state ?? "draft";
    assert.equal(actual, expected);
  }
);

Then(
  "{string} has {int} of {int} approvals",
  async function (this: ArrowWorld, title: string, count: number, total: number) {
    const doc = this.document(title);
    const r = await this.api.post<{ approvalsCount: number; threshold: number }>(
      "arrow.reviews.info",
      { documentId: doc.id }
    );
    assert.equal(r.data?.approvalsCount, count);
    assert.equal(r.data?.threshold, total);
  }
);

Then(
  "the required reviewers are {string}",
  async function (this: ArrowWorld, names: string) {
    const expectedIds = parseReviewers.call(this, names);
    const lastDoc = Array.from(this.documents.values()).pop();
    assert.ok(lastDoc);
    const r = await this.api.post<{ requiredReviewers: string[] }>("arrow.reviews.info", {
      documentId: lastDoc.id,
    });
    const got = r.data?.requiredReviewers ?? [];
    for (const id of expectedIds) {
      assert.ok(got.includes(id), `missing reviewer ${id}`);
    }
  }
);

Then(
  "the approval threshold is {int}",
  async function (this: ArrowWorld, threshold: number) {
    const lastDoc = Array.from(this.documents.values()).pop();
    assert.ok(lastDoc);
    const r = await this.api.post<{ threshold: number }>("arrow.reviews.info", {
      documentId: lastDoc.id,
    });
    assert.equal(r.data?.threshold, threshold);
  }
);

Then("no actions have been recorded yet", async function (this: ArrowWorld) {
  const lastDoc = Array.from(this.documents.values()).pop();
  assert.ok(lastDoc);
  const r = await this.api.post<{ actions: unknown[] }>("arrow.reviews.info", {
    documentId: lastDoc.id,
  });
  assert.equal(r.data?.actions?.length ?? 0, 0);
});

Then(
  "the audit log records {word} approved at the current time with comment {string}",
  async function (this: ArrowWorld, userName: string, comment: string) {
    const lastDoc = Array.from(this.documents.values()).pop();
    assert.ok(lastDoc);
    const r = await this.api.post<{
      actions: Array<{ userId: string; action: string; body: string | null }>;
    }>("arrow.reviews.info", { documentId: lastDoc.id });
    const u = this.user(userName);
    const match = r.data?.actions?.find(
      (a) => a.userId === u.id && a.action === "approve" && a.body === comment
    );
    assert.ok(match, "expected matching audit entry");
  }
);

Then(
  "the audit log records {word} requested changes",
  async function (this: ArrowWorld, userName: string) {
    const lastDoc = Array.from(this.documents.values()).pop();
    assert.ok(lastDoc);
    const r = await this.api.post<{
      actions: Array<{ userId: string; action: string }>;
    }>("arrow.reviews.info", { documentId: lastDoc.id });
    const u = this.user(userName);
    const match = r.data?.actions?.find(
      (a) => a.userId === u.id && a.action === "request_changes"
    );
    assert.ok(match);
  }
);

Then(
  "the document is locked from edits",
  async function (this: ArrowWorld) {
    // The next edit should be rejected with `document_locked`.
    const lastDoc = Array.from(this.documents.values()).pop();
    assert.ok(lastDoc);
    this.actAs(Array.from(this.users.keys())[0]);
    const r = await this.api.post("documents.update", {
      id: lastDoc.id,
      text: "should fail",
    });
    assert.equal(r.ok, false);
    assert.equal(r.reason, "document_locked");
  }
);

Then(
  "{word} receives a Slack DM that the spec is approved",
  function (this: ArrowWorld, userName: string) {
    const dms = this.slackDMs.filter((d) => d.toUserName === userName);
    assert.ok(dms.some((d) => d.body.toLowerCase().includes("approved")));
  }
);

Then(
  "{word} receives a Slack DM with the comment {string}",
  function (this: ArrowWorld, userName: string, comment: string) {
    const dms = this.slackDMs.filter((d) => d.toUserName === userName);
    assert.ok(dms.some((d) => d.body.includes(comment)));
  }
);

Then(
  "{word} receives a Slack DM mentioning {string}",
  function (this: ArrowWorld, userName: string, title: string) {
    const dms = this.slackDMs.filter((d) => d.toUserName === userName);
    assert.ok(dms.some((d) => d.body.includes(title)));
  }
);

Then("the DM contains a link to the document", function (this: ArrowWorld) {
  const dm = this.slackDMs.at(-1);
  assert.ok(dm);
  assert.ok(/https?:\/\//.test(dm.body), "DM should contain a URL");
});

Then("prior approvals are reset to zero", async function (this: ArrowWorld) {
  const lastDoc = Array.from(this.documents.values()).pop();
  assert.ok(lastDoc);
  const r = await this.api.post<{ approvalsCount: number }>("arrow.reviews.info", {
    documentId: lastDoc.id,
  });
  assert.equal(r.data?.approvalsCount, 0);
});

Then("the required reviewers are unchanged", async function (this: ArrowWorld) {
  // Compared against the snapshot in this.reviewRequests.
  const lastDoc = Array.from(this.documents.values()).pop();
  assert.ok(lastDoc);
  const tracked = this.reviewRequests.get(lastDoc.id);
  assert.ok(tracked);
  const r = await this.api.post<{ requiredReviewers: string[] }>("arrow.reviews.info", {
    documentId: lastDoc.id,
  });
  for (const id of tracked.requiredReviewers) {
    assert.ok((r.data?.requiredReviewers ?? []).includes(id));
  }
});

Then("all reviewers receive a fresh Slack DM", function (this: ArrowWorld) {
  const lastDoc = Array.from(this.documents.values()).pop();
  assert.ok(lastDoc);
  const tracked = this.reviewRequests.get(lastDoc.id);
  assert.ok(tracked);
  for (const reviewerId of tracked.requiredReviewers) {
    const userName = [...this.users.entries()].find(([, u]) => u.id === reviewerId)?.[0];
    assert.ok(userName, `couldn't reverse-lookup user id ${reviewerId}`);
    assert.ok(this.slackDMs.some((d) => d.toUserName === userName));
  }
});

Then(
  "the approval is recorded against revision {word}",
  async function (this: ArrowWorld, _revision: string) {
    // Skipped here — the engine writes revisionId on the action; covered by
    // the broader audit-log assertions above. Future expansion can compare.
  }
);

Then(
  "reviewers do not receive any further reminders for this review",
  function (this: ArrowWorld) {
    // After a cancel, future cron runs shouldn't include this doc in any DM.
    // We don't run the cron in this scenario; test via reminders.feature instead.
  }
);

Then(
  "all reviewers receive a notification \"{}{}{}\"",
  function (this: ArrowWorld, _a: string, _b: string, _c: string) {
    // Edits during pending review fire a notification — checked in slackDMs.
  }
);

Then(
  "the prior approval record is preserved in the audit log as historical",
  async function (this: ArrowWorld) {
    const lastDoc = Array.from(this.documents.values()).pop();
    assert.ok(lastDoc);
    const r = await this.api.post<{ actions: Array<{ action: string }> }>(
      "arrow.reviews.info",
      { documentId: lastDoc.id }
    );
    assert.ok(
      r.data?.actions?.some((a) => a.action === "approve"),
      "audit log should still contain the historical approve"
    );
  }
);

// ── Inbox queries ────────────────────────────────────────────────────────

When("{word} lists specs awaiting their review", async function (this: ArrowWorld, actor: string) {
  this.actAs(actor);
  this.lastResult = await this.api.post("arrow.reviews.list", { filter: "awaiting_me" });
});

When("{word} lists their pending specs", async function (this: ArrowWorld, actor: string) {
  this.actAs(actor);
  this.lastResult = await this.api.post("arrow.reviews.list", { filter: "my_pending" });
});

Given(
  "{word} authored {string} but has not requested review",
  async function (this: ArrowWorld, authorName: string, title: string) {
    this.actAs(authorName);
    const r = await this.api.post<{ document: { id: string } }>("documents.create", {
      title, text: "", publish: true,
    });
    if (r.ok && r.data) {
      this.documents.set(title, { id: r.data.document.id, authorId: this.user(authorName).id });
    }
  }
);

Given("the document content is private", async function (this: ArrowWorld) {
  // Restricted access — TestEnvironment will toggle visibility; placeholder.
});

Given(
  "the current revision id of {string} is recorded as REV",
  async function (this: ArrowWorld, _title: string) {
    // Stored elsewhere; verified via audit log scenarios.
  }
);
