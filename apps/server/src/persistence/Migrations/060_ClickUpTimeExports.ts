import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`CREATE TABLE clickup_time_exports (
    root_record_id TEXT PRIMARY KEY,
    fingerprint TEXT NOT NULL,
    user_id INTEGER NOT NULL,
    workspace_id TEXT NOT NULL,
    task_id TEXT NOT NULL,
    task_name TEXT NOT NULL,
    state TEXT NOT NULL,
    remote_id TEXT
  )`;
  yield* sql`CREATE INDEX work_records_supersedes ON work_records(supersedes_id) WHERE supersedes_id IS NOT NULL`;
});
