import { assert, it } from "@effect/vitest";
import * as NodeSqliteClient from "@t3tools/shared/nodeSqliteClient";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { runMigrations } from "../Migrations.ts";

const layer = it.layer(Layer.mergeAll(NodeSqliteClient.layer({ filename: ":memory:" })));

layer("055_WorkTrackingReportSnapshots", (it) => {
  it.effect("repairs databases created before report snapshot columns were added", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* runMigrations({ toMigrationInclusive: 54 });
      yield* sql`DROP TABLE work_report_records`;
      yield* sql`DROP TABLE work_reports`;
      yield* sql`
        CREATE TABLE work_reports (
          id TEXT PRIMARY KEY, tracking_project_id TEXT NOT NULL REFERENCES work_tracking_projects(id),
          month TEXT NOT NULL, status TEXT NOT NULL, generated_at TEXT NOT NULL,
          status_at TEXT NOT NULL, revision INTEGER NOT NULL, reference TEXT
        )
      `;

      yield* runMigrations({ toMigrationInclusive: 55 });

      const columns = yield* sql<{ readonly name: string }>`PRAGMA table_info(work_reports)`;
      assert.isTrue(columns.some((column) => column.name === "project_name_snapshot"));
      assert.isTrue(columns.some((column) => column.name === "profile_display_name_snapshot"));
    }),
  );

  it.effect("is a no-op for fresh Work databases", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* runMigrations({ toMigrationInclusive: 55 });
      const columns = yield* sql<{ readonly name: string }>`PRAGMA table_info(work_reports)`;
      assert.equal(columns.filter((column) => column.name.endsWith("_name_snapshot")).length, 2);
    }),
  );
});
