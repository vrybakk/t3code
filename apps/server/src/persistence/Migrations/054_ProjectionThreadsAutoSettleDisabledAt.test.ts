import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as NodeSqliteClient from "@t3tools/shared/nodeSqliteClient";

import { runMigrations } from "../Migrations.ts";
import migrateAutoSettleDisabledAt from "./054_ProjectionThreadsAutoSettleDisabledAt.ts";

it.layer(NodeSqliteClient.layer({ filename: ":memory:" }))(
  "054_ProjectionThreadsAutoSettleDisabledAt",
  (it) => {
    it.effect(
      "upgrades an existing Nerd ledger without changing its data or migration history",
      () =>
        Effect.gen(function* () {
          const sql = yield* SqlClient.SqlClient;
          yield* runMigrations({ toMigrationInclusive: 57 });
          yield* sql`INSERT INTO work_profiles
          (id, display_name, time_zone, tracking_enabled, created_at, updated_at)
          VALUES ('profile', 'Existing developer', 'UTC', 1, '2026-01-01', '2026-01-01')`;
          const history =
            yield* sql`SELECT migration_id, name FROM effect_sql_migrations ORDER BY migration_id`;

          assert.deepEqual(yield* runMigrations(), [[58, "ProjectionThreadsAutoSettleDisabledAt"]]);
          assert.deepEqual(
            yield* sql`SELECT migration_id, name FROM effect_sql_migrations WHERE migration_id <= 57 ORDER BY migration_id`,
            history,
          );
          assert.deepEqual(
            yield* sql`SELECT display_name FROM work_profiles WHERE id = 'profile'`,
            [{ display_name: "Existing developer" }],
          );
          const columns = yield* sql<{
            readonly name: string;
          }>`PRAGMA table_info(projection_threads)`;
          assert.isTrue(columns.some((column) => column.name === "auto_settle_disabled_at"));
          assert.deepEqual(yield* runMigrations(), []);
        }).pipe(Effect.provide(NodeSqliteClient.layer({ filename: ":memory:" }))),
    );

    it.effect(
      "bridges the official slot 54 before applying Nerd report and ClickUp migrations",
      () =>
        Effect.gen(function* () {
          const sql = yield* SqlClient.SqlClient;
          yield* runMigrations({ toMigrationInclusive: 53 });
          yield* migrateAutoSettleDisabledAt;
          yield* sql`INSERT INTO effect_sql_migrations (migration_id, name)
          VALUES (54, 'ProjectionThreadsAutoSettleDisabledAt')`;

          assert.deepEqual(yield* runMigrations(), [
            [55, "WorkTrackingReportSnapshots"],
            [56, "ClickUpThreadTasks"],
            [57, "ClickUpWorkflow"],
            [58, "ProjectionThreadsAutoSettleDisabledAt"],
          ]);
          assert.deepEqual(
            yield* sql`SELECT name FROM effect_sql_migrations WHERE migration_id = 54`,
            [{ name: "ProjectionThreadsAutoSettleDisabledAt" }],
          );
          const tables = yield* sql<{
            readonly name: string;
          }>`SELECT name FROM sqlite_master WHERE type = 'table'`;
          for (const name of [
            "work_profiles",
            "work_reports",
            "projection_thread_clickup_tasks",
            "clickup_workflow_handoffs",
          ]) {
            assert.isTrue(tables.some((table) => table.name === name));
          }
          const columns = yield* sql<{ readonly name: string }>`PRAGMA table_info(work_reports)`;
          assert.isTrue(columns.some((column) => column.name === "project_name_snapshot"));
          assert.isTrue(columns.some((column) => column.name === "profile_display_name_snapshot"));
          assert.deepEqual(yield* runMigrations(), []);
        }).pipe(Effect.provide(NodeSqliteClient.layer({ filename: ":memory:" }))),
    );

    it.effect("adds the column with auto-settle left on for existing threads", () =>
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
        yield* runMigrations({ toMigrationInclusive: 53 });
        const now = "2026-01-01T00:00:00.000Z";
        yield* sql`
        INSERT INTO projection_threads (
          thread_id, project_id, title, model_selection_json, runtime_mode,
          created_at, updated_at
        ) VALUES (
          'thread-1', 'project-1', 'Existing thread',
          '{"instanceId":"codex","model":"gpt-5.4"}', 'full-access', ${now}, ${now}
        )
      `;
        yield* runMigrations({ toMigrationInclusive: 58 });
        const migrated = yield* sql<{ readonly autoSettleDisabledAt: string | null }>`
        SELECT auto_settle_disabled_at AS "autoSettleDisabledAt" FROM projection_threads WHERE thread_id = 'thread-1'
      `;
        assert.deepEqual(migrated, [{ autoSettleDisabledAt: null }]);
        // Re-running against a database that already has the column keeps its value.
        yield* sql`UPDATE projection_threads SET auto_settle_disabled_at = ${now} WHERE thread_id = 'thread-1'`;
        yield* migrateAutoSettleDisabledAt;
        const rows = yield* sql<{ readonly autoSettleDisabledAt: string | null }>`
        SELECT auto_settle_disabled_at AS "autoSettleDisabledAt" FROM projection_threads WHERE thread_id = 'thread-1'
      `;
        assert.deepEqual(rows, [{ autoSettleDisabledAt: now }]);
      }),
    );
  },
);
