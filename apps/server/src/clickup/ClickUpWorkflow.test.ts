import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { task, threadId, url, input, harness, database } from "./ClickUpWorkflow.test-fixtures.ts";

it.effect("starts implementation only after checking the current no agent tag", () =>
  Effect.gen(function* () {
    const { service, state } = yield* harness();
    state.tags = ["No Agent"];
    assert.equal((yield* Effect.result(service.start(task)))._tag, "Failure");
    assert.deepEqual(state.writes, []);
    state.tags = [];
    for (const status of ["QA Testing", "READY"]) {
      state.status = status;
      assert.equal((yield* Effect.result(service.start(task)))._tag, "Failure");
      assert.deepEqual(state.writes, []);
    }
    state.status = "Open";
    yield* service.start(task);
    yield* service.start(task);
    assert.deepEqual(state.writes, ["status:In Progress"]);
  }).pipe(Effect.provide(database)),
);

it.effect("deduplicates findings and never reposts a comment after a lost response", () =>
  Effect.gen(function* () {
    const { service, state } = yield* harness();
    state.tags = ["no agent"];
    const findings = {
      actionable: true as const,
      text: "I need the acceptance criteria for guest checkout.",
    };
    yield* service.findings(task, findings);
    yield* service.findings(task, findings);
    assert.equal(state.comments.length, 1);
    state.failComment = true;
    const second = { ...findings, text: "I need the expected currency." };
    assert.equal((yield* Effect.result(service.findings(task, second)))._tag, "Failure");
    state.failComment = false;
    assert.equal((yield* Effect.result(service.findings(task, second)))._tag, "Failure");
    assert.equal(state.comments.length, 2);
  }).pipe(Effect.provide(database)),
);

it.effect(
  "prepares durable evidence without publishing and excludes foreign or unregistered PRs",
  () =>
    Effect.gen(function* () {
      const { service, state } = yield* harness();
      assert.equal(
        (yield* Effect.result(
          service.prepare(task, threadId, {
            ...input,
            reviewedHeads: [{ url: "https://github.com/other/repo/pull/2", headSha: "abc" }],
          }),
        ))._tag,
        "Failure",
      );
      assert.equal(
        (yield* Effect.result(
          service.prepare(task, threadId, { ...input, evidence: input.evidence.slice(0, 1) }),
        ))._tag,
        "Failure",
      );
      const handoff = yield* service.prepare(task, threadId, input);
      assert.equal((yield* service.prepare(task, threadId, input)).id, handoff.id);
      assert.deepEqual(state.writes, []);
      assert.deepEqual(state.comments, []);
      assert.equal((yield* service.read(task)).handoffs[0]?.id, handoff.id);
      assert.equal(
        (yield* Effect.result(service.submit({ ...task, taskId: "other", handoffId: handoff.id })))
          ._tag,
        "Failure",
      );
    }).pipe(Effect.provide(database)),
);

it.effect("shows the latest handoff and blocks an older pending submission", () =>
  Effect.gen(function* () {
    const { service, state } = yield* harness();
    const original = yield* service.prepare(task, threadId, input);
    const revised = yield* service.prepare(task, threadId, {
      ...input,
      summary: "Updated review summary for the same pull request.",
    });
    assert.notEqual(revised.id, original.id);
    assert.deepEqual(
      (yield* service.read(task)).handoffs.map((handoff) => handoff.id),
      [revised.id],
    );
    assert.equal(
      (yield* Effect.result(service.submit({ ...task, handoffId: original.id })))._tag,
      "Failure",
    );
    assert.deepEqual(state.writes, []);
    assert.deepEqual(state.comments, []);
    assert.equal((yield* service.submit({ ...task, handoffId: revised.id })).status, "submitted");
    assert.deepEqual(
      (yield* service.read(task)).handoffs.map((handoff) => handoff.id),
      [revised.id],
    );
  }).pipe(Effect.provide(database)),
);

it.effect("replaces a failed partial handoff with the latest reviewed handoff", () =>
  Effect.gen(function* () {
    const { service, state } = yield* harness();
    const original = yield* service.prepare(task, threadId, input);
    state.head = "changed-head";
    const partial = yield* service.submit({ ...task, handoffId: original.id });
    assert.equal(partial.status, "partial");
    assert.include(partial.error, "changed after review");
    state.head = "abc";
    const revised = yield* service.prepare(task, threadId, {
      ...input,
      summary: "Updated review summary for the same pull request.",
    });
    assert.deepEqual(
      (yield* service.read(task)).handoffs.map((handoff) => handoff.id),
      [revised.id],
    );
    assert.equal(
      (yield* Effect.result(service.submit({ ...task, handoffId: original.id })))._tag,
      "Failure",
    );
    assert.deepEqual(state.writes, []);
  }).pipe(Effect.provide(database)),
);

it.effect("rejects changed or unlinked PR heads before any submit write", () =>
  Effect.gen(function* () {
    const { service, state, sql } = yield* harness();
    assert.equal(
      (yield* Effect.result(
        service.prepare(task, threadId, {
          ...input,
          reviewedHeads: [{ url, headSha: "old-head" }],
        }),
      ))._tag,
      "Failure",
    );
    const handoff = yield* service.prepare(task, threadId, input);
    state.status = "QA Testing";
    assert.equal((yield* service.submit({ ...task, handoffId: handoff.id })).status, "partial");
    assert.deepEqual(state.writes, []);
    state.status = "In Progress";
    state.head = "new-head";
    const changed = yield* service.submit({ ...task, handoffId: handoff.id });
    assert.equal(changed.status, "partial");
    assert.include(changed.error, "changed after review");
    assert.deepEqual(state.writes, []);
    state.head = "abc";
    yield* sql`DELETE FROM projection_thread_pull_requests`;
    assert.include((yield* service.submit({ ...task, handoffId: handoff.id })).error, "unlinked");
  }).pipe(Effect.provide(database)),
);

it.effect("submits in order and repeated submit never duplicates final comments", () =>
  Effect.gen(function* () {
    const { service, state } = yield* harness();
    const handoff = yield* service.prepare(task, threadId, input);
    const submitted = yield* service.submit({ ...task, handoffId: handoff.id });
    assert.equal(submitted.status, "submitted");
    assert.deepEqual(state.writes, ["ready", "reviewer", "status:Code Review"]);
    yield* service.submit({ ...task, handoffId: handoff.id });
    assert.equal(state.comments.length, 1);
  }).pipe(Effect.provide(database)),
);

it.effect("persists partial PR progress and resumes only remaining provider operations", () =>
  Effect.gen(function* () {
    const { service, state } = yield* harness();
    const handoff = yield* service.prepare(task, threadId, input);
    state.failReviewer = true;
    const partial = yield* service.submit({ ...task, handoffId: handoff.id });
    assert.equal(partial.status, "partial");
    assert.equal(partial.pullRequests[0]?.ready, true);
    assert.equal(partial.statusUpdated, false);
    assert.equal(state.comments.length, 0);
    state.failReviewer = false;
    assert.equal((yield* service.submit({ ...task, handoffId: handoff.id })).status, "submitted");
    assert.equal(state.writes.filter((item) => item === "ready").length, 1);
  }).pipe(Effect.provide(database)),
);

it.effect("does not request the author as reviewer and blocks ambiguous comment retries", () =>
  Effect.gen(function* () {
    const { service, state } = yield* harness();
    state.author = "Vrybakk";
    const handoff = yield* service.prepare(task, threadId, input);
    state.failComment = true;
    const result = yield* service.submit({ ...task, handoffId: handoff.id });
    assert.equal(result.status, "uncertain");
    assert.equal(result.commentPosted, false);
    assert.equal(state.writes.includes("reviewer"), false);
    state.failComment = false;
    assert.equal((yield* service.submit({ ...task, handoffId: handoff.id })).status, "uncertain");
    assert.equal(state.comments.length, 1);
  }).pipe(Effect.provide(database)),
);

it.effect(
  "requires a concise waiver disclosure and keeps technical evidence out of the final comment",
  () =>
    Effect.gen(function* () {
      const { service, state } = yield* harness();
      const waived = {
        ...input,
        evidence: input.evidence.map((item) =>
          item.kind === "verification"
            ? {
                ...item,
                outcome: "waived" as const,
                details:
                  "Developer explicitly approved skipping browser verification because staging is unavailable.",
              }
            : item,
        ),
      };
      assert.equal((yield* Effect.result(service.prepare(task, threadId, waived)))._tag, "Failure");
      const handoff = yield* service.prepare(task, threadId, {
        ...waived,
        waiverSummary: "The developer approved skipping browser verification.",
      });
      yield* service.submit({ ...task, handoffId: handoff.id });
      assert.include(state.comments[0], "approved skipping browser verification");
      assert.notInclude(state.comments[0], "staging is unavailable");
    }).pipe(Effect.provide(database)),
);

it.effect("collects reviewed PRs across repositories but excludes other tasks", () =>
  Effect.gen(function* () {
    const { service, sql } = yield* harness();
    const apiUrl = "https://github.com/studio/api/pull/2";
    const foreignUrl = "https://github.com/studio/other/pull/3";
    yield* sql`INSERT INTO projection_threads VALUES ('api-thread', 'api-project', NULL), ('foreign-thread', 'foreign-project', NULL)`;
    yield* sql`INSERT INTO projection_thread_clickup_tasks (thread_id, task_id, workspace_id) VALUES ('api-thread', 'task', '42'), ('foreign-thread', 'other-task', '42')`;
    yield* sql`INSERT INTO projection_thread_pull_requests VALUES ('api-thread', 'github.com', 'studio/api', 2, ${apiUrl}), ('foreign-thread', 'github.com', 'studio/other', 3, ${foreignUrl})`;
    const handoff = yield* service.prepare(task, threadId, {
      ...input,
      reviewedHeads: [...input.reviewedHeads, { url: apiUrl, headSha: "abc" }],
    });
    assert.deepEqual(
      handoff.pullRequests.map((pr) => pr.repository),
      ["studio/repo", "studio/api"],
    );
    assert.equal(
      (yield* Effect.result(
        service.prepare(task, threadId, {
          ...input,
          reviewedHeads: [{ url: foreignUrl, headSha: "abc" }],
        }),
      ))._tag,
      "Failure",
    );
  }).pipe(Effect.provide(database)),
);

it.effect(
  "prepares and submits explicitly reviewed PRs for a context task without promoting it",
  () =>
    Effect.gen(function* () {
      const { service, sql, state } = yield* harness();
      yield* sql`UPDATE projection_thread_clickup_tasks SET is_primary = 0`;
      const handoff = yield* service.prepare(task, threadId, input);
      assert.deepEqual(
        handoff.pullRequests.map((pr) => pr.url),
        [url],
      );
      assert.deepEqual(state.writes, []);
      assert.deepEqual(state.comments, []);
      assert.equal((yield* service.submit({ ...task, handoffId: handoff.id })).status, "submitted");
      const rows = yield* sql<{
        is_primary: number;
      }>`SELECT is_primary FROM projection_thread_clickup_tasks`;
      assert.deepEqual(rows, [{ is_primary: 0 }]);
    }).pipe(Effect.provide(database)),
);

it.effect("rejects a context task handoff after its thread link is removed", () =>
  Effect.gen(function* () {
    const { service, sql, state } = yield* harness();
    yield* sql`UPDATE projection_thread_clickup_tasks SET is_primary = 0`;
    const handoff = yield* service.prepare(task, threadId, input);
    yield* sql`DELETE FROM projection_thread_clickup_tasks`;
    assert.equal((yield* Effect.result(service.prepare(task, threadId, input)))._tag, "Failure");
    const receipt = yield* service.submit({ ...task, handoffId: handoff.id });
    assert.equal(receipt.status, "partial");
    assert.include(receipt.error, "unlinked");
    assert.deepEqual(state.writes, []);
    assert.deepEqual(state.comments, []);
  }).pipe(Effect.provide(database)),
);

for (const initialStatus of ["In Progress", "Code Review"]) {
  it.effect(`sends reviewed merged PRs from ${initialStatus} to QA without PR writes`, () =>
    Effect.gen(function* () {
      const { service, state } = yield* harness();
      const handoff = yield* service.prepare(task, threadId, input);
      state.prState = "merged";
      state.status = initialStatus;
      const receipt = yield* service.submit({ ...task, handoffId: handoff.id });
      assert.equal(receipt.status, "submitted");
      assert.equal(receipt.destination, "qa");
      assert.equal(receipt.pullRequests[0]?.merged, true);
      assert.deepEqual(state.writes, ["status:QA Testing"]);
      assert.equal(state.comments.length, 1);
      yield* service.submit({ ...task, handoffId: handoff.id });
      assert.deepEqual(state.writes, ["status:QA Testing"]);
      assert.equal(state.comments.length, 1);
    }).pipe(Effect.provide(database)),
  );
}

it.effect("continues a submitted code review to QA after merge without reposting its summary", () =>
  Effect.gen(function* () {
    const { service, state } = yield* harness();
    const handoff = yield* service.prepare(task, threadId, input);
    assert.equal(
      (yield* service.submit({ ...task, handoffId: handoff.id })).destination,
      "code-review",
    );
    state.prState = "merged";
    state.writes.length = 0;
    const receipt = yield* service.submit({ ...task, handoffId: handoff.id });
    assert.equal(receipt.destination, "qa");
    assert.deepEqual(state.writes, ["status:QA Testing"]);
    assert.equal(state.comments.length, 1);
  }).pipe(Effect.provide(database)),
);

it.effect(
  "observes a merge during submission before requesting review or selecting task status",
  () =>
    Effect.gen(function* () {
      const { service, state } = yield* harness();
      const handoff = yield* service.prepare(task, threadId, input);
      state.onReady = () => {
        state.prState = "merged";
      };
      const receipt = yield* service.submit({ ...task, handoffId: handoff.id });
      assert.equal(receipt.destination, "qa");
      assert.deepEqual(state.writes, ["ready", "status:QA Testing"]);
    }).pipe(Effect.provide(database)),
);

for (const scenario of [
  "closed",
  "changed-head",
  "missing-qa",
  "ambiguous-qa",
  "unlinked",
] as const) {
  it.effect(`blocks ${scenario} merged handoff without external writes`, () =>
    Effect.gen(function* () {
      const { service, state, sql } = yield* harness();
      const handoff = yield* service.prepare(task, threadId, input);
      state.prState = scenario === "closed" ? "closed" : "merged";
      if (scenario === "changed-head") state.head = "unreviewed";
      if (scenario === "missing-qa") state.qaStatuses = [];
      if (scenario === "ambiguous-qa") state.qaStatuses = ["QA", "QA Testing"];
      if (scenario === "unlinked") yield* sql`DELETE FROM projection_thread_pull_requests`;
      const receipt = yield* service.submit({ ...task, handoffId: handoff.id });
      assert.equal(receipt.status, "partial");
      assert.isNotNull(receipt.error);
      assert.deepEqual(state.writes, []);
      assert.deepEqual(state.comments, []);
    }).pipe(Effect.provide(database)),
  );
}

it.effect("keeps a mixed open and merged handoff in Code Review until every PR is merged", () =>
  Effect.gen(function* () {
    const { service, state, sql } = yield* harness();
    const secondUrl = "https://github.com/studio/repo/pull/2";
    yield* sql`INSERT INTO projection_thread_pull_requests VALUES ('thread', 'github.com', 'studio/repo', 2, ${secondUrl})`;
    const handoff = yield* service.prepare(task, threadId, {
      ...input,
      reviewedHeads: [...input.reviewedHeads, { url: secondUrl, headSha: "abc" }],
    });
    state.prStates[1] = "merged";
    const receipt = yield* service.submit({ ...task, handoffId: handoff.id });
    assert.equal(receipt.destination, "code-review");
    assert.deepEqual(
      receipt.pullRequests.map((pr) => pr.merged),
      [true, false],
    );
    assert.deepEqual(state.writes, ["ready", "reviewer", "status:Code Review"]);
  }).pipe(Effect.provide(database)),
);

it.effect("does not retry an uncertain merged-handoff comment", () =>
  Effect.gen(function* () {
    const { service, state } = yield* harness();
    const handoff = yield* service.prepare(task, threadId, input);
    state.prState = "merged";
    state.failComment = true;
    const receipt = yield* service.submit({ ...task, handoffId: handoff.id });
    assert.equal(receipt.status, "uncertain");
    state.failComment = false;
    assert.equal((yield* service.submit({ ...task, handoffId: handoff.id })).status, "uncertain");
    assert.equal(state.comments.length, 1);
    assert.deepEqual(state.writes, ["status:QA Testing"]);
  }).pipe(Effect.provide(database)),
);

it.effect("recovers when QA status was applied but its response was lost", () =>
  Effect.gen(function* () {
    const { service, state } = yield* harness();
    const handoff = yield* service.prepare(task, threadId, input);
    state.prState = "merged";
    state.failStatusResponse = true;
    const failed = yield* service.submit({ ...task, handoffId: handoff.id });
    assert.equal(failed.status, "partial");
    assert.equal(state.status, "QA Testing");
    assert.equal(failed.statusUpdated, false);
    assert.deepEqual(state.comments, []);
    state.failStatusResponse = false;
    const recovered = yield* service.submit({ ...task, handoffId: handoff.id });
    assert.equal(recovered.status, "submitted");
    assert.equal(recovered.destination, "qa");
    assert.deepEqual(state.writes, ["status:QA Testing"]);
    assert.equal(state.comments.length, 1);
  }).pipe(Effect.provide(database)),
);
