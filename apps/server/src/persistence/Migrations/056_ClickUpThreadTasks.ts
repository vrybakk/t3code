import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`CREATE TABLE projection_thread_clickup_tasks (
    thread_id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    task_id TEXT NOT NULL,
    name TEXT NOT NULL
  )`;
  yield* sql`CREATE INDEX idx_clickup_task_threads ON projection_thread_clickup_tasks (workspace_id, task_id)`;
});
