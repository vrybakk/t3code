import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`CREATE TABLE clickup_workflow_handoffs (
    id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, task_id TEXT NOT NULL,
    user_id INTEGER NOT NULL, thread_id TEXT NOT NULL, handoff_json TEXT NOT NULL
  )`;
  yield* sql`CREATE INDEX idx_clickup_workflow_task ON clickup_workflow_handoffs(workspace_id, task_id, user_id)`;
  yield* sql`CREATE TABLE clickup_workflow_comments (
    workspace_id TEXT NOT NULL, task_id TEXT NOT NULL, user_id INTEGER NOT NULL,
    operation_key TEXT NOT NULL, state TEXT NOT NULL,
    PRIMARY KEY(workspace_id, task_id, user_id, operation_key)
  )`;
});
