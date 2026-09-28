import { ClickUpError } from "@t3tools/contracts";
import * as NodeSqliteClient from "@t3tools/shared/nodeSqliteClient";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import migration from "../persistence/Migrations/060_ClickUpTimeExports.ts";
import workMigration from "../persistence/Migrations/054_WorkTracking.ts";
import { ClickUpApi } from "./ClickUpApi.ts";
import { ClickUpConnection } from "./ClickUpConnection.ts";
import { ClickUpTasks } from "./ClickUpTasks.ts";
import * as TimeSync from "./ClickUpTimeSync.ts";

export const database = NodeSqliteClient.layer({ filename: ":memory:" });
export const start = Date.parse("2025-01-01T10:00:00.000Z");
interface RemoteEntry {
  id: string;
  start: string;
  duration: string;
  description: string;
  user: { id: number };
  task?: { id: string };
}
export const harness = Effect.fn("timeHarness")(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* workMigration;
  yield* migration;
  yield* sql`CREATE TABLE projection_threads(thread_id TEXT PRIMARY KEY, title TEXT, deleted_at TEXT)`;
  yield* sql`CREATE TABLE projection_turns(thread_id TEXT, turn_id TEXT, started_at TEXT)`;
  yield* sql`CREATE TABLE projection_thread_clickup_tasks(thread_id TEXT, workspace_id TEXT, task_id TEXT, name TEXT, is_primary INTEGER)`;
  yield* sql`INSERT INTO projection_threads VALUES ('thread', 'Task thread', NULL)`;
  yield* sql`INSERT INTO projection_thread_clickup_tasks VALUES ('thread', '42', 'task', 'Primary task', 1)`;
  yield* sql`INSERT INTO work_tracking_projects VALUES ('project', 'Project', 1, '2025-01-01', '2025-01-01')`;
  const add = (
    id: string,
    kind = "agent-turn",
    thread: string | null = "thread",
    revision = 1,
  ) => sql`INSERT INTO work_records
    (id, kind, tracking_project_id, thread_id, turn_id, cross_repository, occurred_at, duration_ms, elapsed_ms, task_ms, outcome, coverage, revision, created_at, updated_at)
    VALUES (${id}, ${kind}, 'project', ${thread}, ${id}, 0, '2025-01-01T10:01:00.000Z', 60000, 60000, 60000, 'completed', 'complete', ${revision}, '2025-01-01', '2025-01-01')`;
  yield* add("agent");
  yield* add("manual", "manual");
  yield* add("subagent", "agent-task");
  const state = {
    userId: 7,
    failRead: false,
    failPost: false,
    loseResponse: false,
    denyTask: false,
    posts: [] as Readonly<Record<string, string | number | boolean | null>>[],
    paths: [] as string[],
    remote: [] as RemoteEntry[],
    onRead: Effect.void as Effect.Effect<void, never>,
  };
  const dependencies = Layer.mergeAll(
    Layer.succeed(SqlClient.SqlClient, sql),
    Layer.mock(ClickUpConnection)({
      account: Effect.sync(() => ({
        token: `token-${state.userId}`,
        connection: {
          configured: true,
          user: { id: state.userId, username: "Developer" },
          workspaces: [{ id: "42", name: "Studio" }],
        },
      })),
    }),
    Layer.mock(ClickUpTasks)({
      authorize: () =>
        state.denyTask ? Effect.fail(new ClickUpError({ message: "Task denied" })) : Effect.void,
    }),
    Layer.mock(ClickUpApi)({
      request: (path, options) =>
        Effect.gen(function* () {
          state.paths.push(path);
          if (options?.method !== "POST") {
            yield* state.onRead;
            if (state.failRead) return yield* new ClickUpError({ message: "Read failed" });
            const query = new URL(`https://example.test/${path}`).searchParams;
            return {
              data: state.remote.filter(
                (entry) =>
                  Number(entry.start) >= Number(query.get("start_date")) &&
                  Number(entry.start) <= Number(query.get("end_date")),
              ),
            };
          }
          const body = options.body!;
          state.posts.push(body);
          if (state.failPost) return yield* new ClickUpError({ message: "Post failed" });
          const entry = {
            id: `entry-${state.posts.length}`,
            start: String(body.start),
            duration: String(body.duration),
            description: String(body.description),
            user: { id: Number(body.assignee) },
            task: { id: String(body.tid) },
          };
          state.remote.push(entry);
          if (state.loseResponse) return yield* new ClickUpError({ message: "Response lost" });
          return { data: entry };
        }),
    }),
  );
  const service = yield* TimeSync.ClickUpTimeSync.pipe(
    Effect.provide(TimeSync.layer.pipe(Layer.provide(dependencies))),
  );
  const selection = Effect.fn(function* (id = "agent", taskId = "task") {
    const record = (yield* service.preview({ userId: 7, offset: 0 })).records.find(
      (r) => r.recordId === id,
    )!;
    return { recordId: id, fingerprint: record.fingerprint, workspaceId: "42", taskId };
  });
  return { service, state, sql, add, selection };
});
