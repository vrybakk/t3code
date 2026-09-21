import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const columns = yield* sql<{ readonly name: string }>`PRAGMA table_info(work_reports)`;

  if (!columns.some((column) => column.name === "project_name_snapshot")) {
    yield* sql`ALTER TABLE work_reports ADD COLUMN project_name_snapshot TEXT`;
  }

  if (!columns.some((column) => column.name === "profile_display_name_snapshot")) {
    yield* sql`ALTER TABLE work_reports ADD COLUMN profile_display_name_snapshot TEXT`;
  }
});
