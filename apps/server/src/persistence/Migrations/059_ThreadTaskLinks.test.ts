import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as NodeSqliteClient from "@t3tools/shared/nodeSqliteClient";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import { runMigrations } from "../Migrations.ts";

it.effect("preserves legacy primary tasks and permits several context links", () =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* runMigrations({ toMigrationInclusive: 58 });
    yield* sql`INSERT INTO projection_thread_clickup_tasks VALUES ('thread', '42', 'original', 'Original task')`;
    yield* runMigrations({ toMigrationInclusive: 59 });
    assert.deepEqual(yield* sql`SELECT * FROM projection_thread_clickup_tasks`, [
      {
        thread_id: "thread",
        workspace_id: "42",
        task_id: "original",
        name: "Original task",
        is_primary: 1,
      },
    ]);
    yield* sql`INSERT INTO projection_thread_clickup_tasks VALUES ('thread', '42', 'context', 'Context task', 0)`;
    assert.equal(
      (yield* Effect.result(
        sql`INSERT INTO projection_thread_clickup_tasks VALUES ('thread', '42', 'second', 'Second primary', 1)`,
      ))._tag,
      "Failure",
    );
    assert.equal((yield* sql`SELECT * FROM projection_thread_clickup_tasks`).length, 2);
  }).pipe(Effect.provide(NodeSqliteClient.layer({ filename: ":memory:" }))),
);
