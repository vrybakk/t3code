import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`ALTER TABLE projection_thread_clickup_tasks RENAME TO projection_thread_clickup_tasks_previous`;
  yield* sql`CREATE TABLE projection_thread_clickup_tasks (
    thread_id TEXT NOT NULL,
    workspace_id TEXT NOT NULL,
    task_id TEXT NOT NULL,
    name TEXT NOT NULL,
    is_primary INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (thread_id, workspace_id, task_id)
  )`;
  yield* sql`INSERT INTO projection_thread_clickup_tasks
    SELECT thread_id, workspace_id, task_id, name, 1 FROM projection_thread_clickup_tasks_previous`;
  yield* sql`DROP TABLE projection_thread_clickup_tasks_previous`;
  yield* sql`CREATE INDEX idx_clickup_task_threads ON projection_thread_clickup_tasks (workspace_id, task_id)`;
  yield* sql`CREATE UNIQUE INDEX idx_clickup_thread_primary ON projection_thread_clickup_tasks (thread_id) WHERE is_primary = 1`;
});
