import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { database, harness, start } from "./ClickUpTimeSync.test-fixtures.ts";

it.effect(
  "previews historical agent runtime and manual entries without writes or overlapping subagent totals",
  () =>
    Effect.gen(function* () {
      const { service, state, add } = yield* harness();
      yield* add("unlinked", "manual", null);
      const data = yield* service.preview({ userId: 7, offset: 0 });
      assert.deepEqual(data.records.map((r) => r.kind).toSorted(), ["agent-turn", "manual"]);
      assert.equal(data.records.find((r) => r.kind === "agent-turn")?.start, start);
      assert.equal(data.records.find((r) => r.kind === "manual")?.start, start + 60000);
      assert.equal(data.unlinkedCount, 1);
      assert.equal(state.posts.length, 0);
    }).pipe(Effect.provide(database)),
);

it.effect(
  "exports positive completed entries with explicit task allocation and prevents concurrent/repeated duplicates",
  () =>
    Effect.gen(function* () {
      const { service, state, sql, selection } = yield* harness();
      yield* sql`INSERT INTO projection_thread_clickup_tasks VALUES ('thread', '42', 'second', 'Second task', 0)`;
      const record = yield* selection("agent", "second");
      const results = yield* Effect.all(
        [
          service.sync({ userId: 7, records: [record] }),
          service.sync({ userId: 7, records: [record] }),
        ],
        { concurrency: 2 },
      );
      assert.isTrue(results.every((r) => r.results[0]?.synced));
      assert.equal(state.posts.length, 1);
      assert.equal(state.posts[0]?.tid, "second");
      assert.equal(state.posts[0]?.duration, 60000);
      assert.equal(state.posts[0]?.start, start);
      assert.equal(state.posts[0]?.billable, false);
      assert.include(String(state.posts[0]?.description), "agent runtime");
      assert.include(state.paths[0], `start_date=${start - 1}`);
      assert.isFalse(
        (yield* service.sync({ userId: 7, records: [{ ...record, taskId: "task" }] })).results[0]!
          .synced,
      );
    }).pipe(Effect.provide(database)),
);

it.effect("recovers a lost create response from its remote marker without posting again", () =>
  Effect.gen(function* () {
    const { service, state, selection } = yield* harness();
    const record = yield* selection();
    state.loseResponse = true;
    assert.isFalse((yield* service.sync({ userId: 7, records: [record] })).results[0]!.synced);
    assert.equal(
      (yield* service.preview({ userId: 7, offset: 0 })).records.find((r) => r.recordId === "agent")
        ?.state,
      "uncertain",
    );
    assert.isTrue((yield* service.sync({ userId: 7, records: [record] })).results[0]!.synced);
    assert.equal(state.posts.length, 1);
  }).pipe(Effect.provide(database)),
);

it.effect("never retries an uncertain create without a matching remote entry", () =>
  Effect.gen(function* () {
    const { service, state, selection } = yield* harness();
    const record = yield* selection();
    state.failPost = true;
    yield* service.sync({ userId: 7, records: [record] });
    state.failPost = false;
    assert.isFalse((yield* service.sync({ userId: 7, records: [record] })).results[0]!.synced);
    assert.equal(state.posts.length, 1);
  }).pipe(Effect.provide(database)),
);

it.effect("manual revisions inherit the original receipt and cannot export twice", () =>
  Effect.gen(function* () {
    const { service, state, sql, add, selection } = yield* harness();
    yield* service.sync({ userId: 7, records: [yield* selection("manual")] });
    assert.include(String(state.posts[0]?.description), "manual work");
    yield* add("manual-revised", "manual", "thread", 2);
    yield* sql`UPDATE work_records SET supersedes_id = 'manual-revised' WHERE id = 'manual'`;
    const data = yield* service.preview({ userId: 7, offset: 0 });
    assert.equal(data.records.find((r) => r.recordId === "manual-revised")?.state, "changed");
    assert.isFalse(
      (yield* service.sync({ userId: 7, records: [yield* selection("manual-revised")] }))
        .results[0]!.synced,
    );
    assert.equal(state.posts.length, 1);
  }).pipe(Effect.provide(database)),
);

it.effect(
  "rejects stale records, unlinked tasks, denied tasks and account changes before creating time",
  () =>
    Effect.gen(function* () {
      const { service, state, selection } = yield* harness();
      const record = yield* selection();
      for (const invalid of [
        { ...record, fingerprint: "old" },
        { ...record, taskId: "unlinked" },
      ])
        assert.isFalse((yield* service.sync({ userId: 7, records: [invalid] })).results[0]!.synced);
      state.denyTask = true;
      assert.isFalse((yield* service.sync({ userId: 7, records: [record] })).results[0]!.synced);
      state.denyTask = false;
      state.onRead = Effect.sync(() => {
        state.userId = 8;
      });
      assert.isFalse((yield* service.sync({ userId: 7, records: [record] })).results[0]!.synced);
      assert.equal(state.posts.length, 0);
    }).pipe(Effect.provide(database)),
);

it.effect("reconciles remote markers after receipt loss and rejects similar unmarked time", () =>
  Effect.gen(function* () {
    const { service, state, sql, selection } = yield* harness();
    const record = yield* selection();
    yield* service.sync({ userId: 7, records: [record] });
    yield* sql`DELETE FROM clickup_time_exports`;
    assert.isTrue((yield* service.sync({ userId: 7, records: [record] })).results[0]!.synced);
    assert.equal(state.posts.length, 1);
    yield* sql`DELETE FROM clickup_time_exports`;
    state.remote[0]!.description = "Existing manual entry";
    assert.isFalse((yield* service.sync({ userId: 7, records: [record] })).results[0]!.synced);
    assert.equal(state.posts.length, 1);
  }).pipe(Effect.provide(database)),
);

it.effect(
  "a failed preflight remains retryable and changed remote markers are not overwritten",
  () =>
    Effect.gen(function* () {
      const { service, state, selection } = yield* harness();
      const record = yield* selection();
      state.failRead = true;
      yield* service.sync({ userId: 7, records: [record] });
      state.failRead = false;
      state.loseResponse = true;
      yield* service.sync({ userId: 7, records: [record] });
      state.remote[0]!.duration = "90000";
      assert.isFalse((yield* service.sync({ userId: 7, records: [record] })).results[0]!.synced);
      assert.equal(state.posts.length, 1);
    }).pipe(Effect.provide(database)),
);

it.effect("unassigned remote time entries do not block an export", () =>
  Effect.gen(function* () {
    const { service, state, selection } = yield* harness();
    state.remote.push({
      id: "unassigned",
      start: String(start),
      duration: "60000",
      description: "Unassigned work",
      user: { id: 7 },
    });
    assert.isTrue(
      (yield* service.sync({ userId: 7, records: [yield* selection()] })).results[0]!.synced,
    );
    assert.equal(state.posts.length, 1);
  }).pipe(Effect.provide(database)),
);

it.effect(
  "finds older manual lineage dates after receipt loss instead of exporting an edited entry twice",
  () =>
    Effect.gen(function* () {
      const { service, state, sql, add, selection } = yield* harness();
      yield* service.sync({ userId: 7, records: [yield* selection("manual")] });
      yield* add("manual-later", "manual", "thread", 2);
      yield* sql`UPDATE work_records SET occurred_at = '2025-03-01T10:01:00.000Z' WHERE id = 'manual-later'`;
      yield* sql`UPDATE work_records SET supersedes_id = 'manual-later' WHERE id = 'manual'`;
      yield* sql`DELETE FROM clickup_time_exports`;
      assert.isFalse(
        (yield* service.sync({ userId: 7, records: [yield* selection("manual-later")] }))
          .results[0]!.synced,
      );
      assert.equal(state.posts.length, 1);
    }).pipe(Effect.provide(database)),
);
