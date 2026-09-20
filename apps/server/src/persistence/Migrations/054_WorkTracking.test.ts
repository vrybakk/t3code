import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as NodeSqliteClient from "@t3tools/shared/nodeSqliteClient";

import { runMigrations } from "../Migrations.ts";

const layer = it.layer(Layer.mergeAll(NodeSqliteClient.layer({ filename: ":memory:" })));

layer("054_WorkTracking", (it) => {
  it.effect("creates local ledger tables and idempotent source event index", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* runMigrations({ toMigrationInclusive: 54 });
      const tables = yield* sql<{ readonly name: string }>`
        SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'work_%'
      `;
      assert.deepEqual(tables.map((table) => table.name).toSorted(), [
        "work_deliveries",
        "work_profiles",
        "work_records",
        "work_report_records",
        "work_reports",
        "work_repositories",
        "work_tracking_project_bindings",
        "work_tracking_projects",
      ]);
      const indexes = yield* sql<{ readonly name: string }>`PRAGMA index_list(work_records)`;
      assert.isTrue(indexes.some((index) => index.name.includes("sqlite_autoindex_work_records")));
      const bindings = yield* sql<{
        readonly name: string;
        readonly unique: number;
      }>`PRAGMA index_list(work_tracking_project_bindings)`;
      assert.isTrue(bindings.some((index) => index.unique === 1));
      const deliveries = yield* sql<{ readonly name: string }>`PRAGMA index_list(work_deliveries)`;
      assert.isTrue(deliveries.some((index) => index.name === "work_deliveries_one_open_cycle"));
      const reportColumns = yield* sql<{ readonly name: string }>`PRAGMA table_info(work_reports)`;
      assert.isTrue(reportColumns.some((column) => column.name === "project_name_snapshot"));
      assert.isTrue(
        reportColumns.some((column) => column.name === "profile_display_name_snapshot"),
      );
      yield* sql`INSERT INTO work_tracking_projects(id, name, tracking_enabled, created_at, updated_at) VALUES ('first', 'First', 1, '2026-09-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z'), ('second', 'Second', 1, '2026-09-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z')`;
      yield* sql`INSERT INTO work_tracking_project_bindings(tracking_project_id, project_id) VALUES ('first', 't3-project')`;
      const duplicateBinding = yield* Effect.flip(
        sql`INSERT INTO work_tracking_project_bindings(tracking_project_id, project_id) VALUES ('second', 't3-project')`,
      );
      assert.ok(duplicateBinding);
    }),
  );
});
