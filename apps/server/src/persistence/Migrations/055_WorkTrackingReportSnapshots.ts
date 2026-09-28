import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import migrateWorkTracking from "./054_WorkTracking.ts";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const [previous] = yield* sql<{ readonly name: string }>`
    SELECT name FROM effect_sql_migrations WHERE migration_id = 54
  `;
  // Official builds used slot 54 for auto-settle; their shared database skipped Nerd's ledger.
  if (previous?.name === "ProjectionThreadsAutoSettleDisabledAt") {
    yield* migrateWorkTracking;
  }
  const columns = yield* sql<{ readonly name: string }>`PRAGMA table_info(work_reports)`;

  if (!columns.some((column) => column.name === "project_name_snapshot")) {
    yield* sql`ALTER TABLE work_reports ADD COLUMN project_name_snapshot TEXT`;
  }

  if (!columns.some((column) => column.name === "profile_display_name_snapshot")) {
    yield* sql`ALTER TABLE work_reports ADD COLUMN profile_display_name_snapshot TEXT`;
  }
});
