import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { ClickUpHandoff } from "@t3tools/contracts";
import { taskScopeFingerprint } from "./ClickUpTaskScope.ts";
import { task, threadId, input, harness, database } from "./ClickUpWorkflow.test-fixtures.ts";

const encodeHandoff = Schema.encodeEffect(Schema.fromJsonString(ClickUpHandoff));

it.effect("rejects unreviewed task scope during preparation", () =>
  Effect.gen(function* () {
    const { service, state } = yield* harness();
    state.description = "New acceptance criteria";
    assert.equal((yield* Effect.result(service.prepare(task, threadId, input)))._tag, "Failure");
    assert.deepEqual((yield* service.read(task)).handoffs, []);
    assert.deepEqual(state.writes, []);
  }).pipe(Effect.provide(database)),
);

it.effect(
  "blocks changed titles and descriptions before submit writes and permits a reviewed replacement",
  () =>
    Effect.gen(function* () {
      const { service, state } = yield* harness();
      const original = yield* service.prepare(task, threadId, input);
      for (const field of ["name", "description"] as const) {
        const before = state[field];
        state[field] = "Changed requirements";
        assert.equal(
          (yield* service.submit({ ...task, handoffId: original.id })).status,
          "partial",
        );
        assert.deepEqual(state.writes, []);
        assert.deepEqual(state.comments, []);
        state[field] = before;
      }
      state.description = "New acceptance criteria";
      const replacement = yield* service.prepare(task, threadId, {
        ...input,
        reviewedTaskScope: taskScopeFingerprint({
          ...task,
          name: state.name,
          description: state.description,
        }),
      });
      assert.notEqual(replacement.id, original.id);
      assert.equal(
        (yield* service.submit({ ...task, handoffId: replacement.id })).status,
        "submitted",
      );
    }).pipe(Effect.provide(database)),
);

it.effect("stops a partial submission if scope changes after marking a PR ready", () =>
  Effect.gen(function* () {
    const { service, state } = yield* harness();
    const prepared = yield* service.prepare(task, threadId, input);
    state.onReady = () => {
      state.description = "Scope changed while submitting";
    };
    const result = yield* service.submit({ ...task, handoffId: prepared.id });
    assert.equal(result.status, "partial");
    assert.include(result.error, "title or description changed");
    assert.deepEqual(state.writes, ["ready"]);
    assert.deepEqual(state.comments, []);
    assert.equal(result.pullRequests[0]?.ready, true);
  }).pipe(Effect.provide(database)),
);

it.effect(
  "requires legacy pending handoffs to be prepared again but preserves completed receipts",
  () =>
    Effect.gen(function* () {
      const { service, state, sql } = yield* harness();
      const prepared = yield* service.prepare(task, threadId, input);
      const { taskScopeFingerprint: _fingerprint, ...legacy } = prepared;
      yield* sql`UPDATE clickup_workflow_handoffs SET handoff_json = ${yield* encodeHandoff(legacy)}`;
      assert.equal((yield* service.submit({ ...task, handoffId: prepared.id })).status, "partial");
      assert.deepEqual(state.writes, []);
      for (const status of ["submitted", "uncertain"] as const) {
        yield* sql`UPDATE clickup_workflow_handoffs SET handoff_json = ${yield* encodeHandoff({ ...legacy, status })}`;
        state.description = "Later requirement";
        assert.equal((yield* service.submit({ ...task, handoffId: prepared.id })).status, status);
        assert.deepEqual(state.writes, []);
      }
    }).pipe(Effect.provide(database)),
);

it.effect("reads stored handoffs without fetching comments and task metadata", () =>
  Effect.gen(function* () {
    const { service, state } = yield* harness();
    yield* service.read(task);
    assert.equal(state.authorizationReads, 1);
    assert.equal(state.detailReads, 0);
  }).pipe(Effect.provide(database)),
);
