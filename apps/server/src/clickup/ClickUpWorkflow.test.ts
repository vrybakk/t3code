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
    assert.equal(
      (yield* Effect.result(service.submit({ ...task, handoffId: handoff.id })))._tag,
      "Failure",
    );
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
    yield* sql`INSERT INTO projection_thread_clickup_tasks VALUES ('api-thread', 'task', '42'), ('foreign-thread', 'other-task', '42')`;
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
