import * as NodeCrypto from "node:crypto";
import {
  ClickUpError,
  ClickUpHandoff,
  type ClickUpTaskInput,
  type ThreadId,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import { ClickUpInteractions } from "./ClickUpInteractions.ts";

const decodeHandoffs = Schema.decodeUnknownEffect(
  Schema.Array(Schema.fromJsonString(ClickUpHandoff)),
);
const encodeHandoff = Schema.encodeEffect(Schema.fromJsonString(ClickUpHandoff));

export class ClickUpWorkflowStore extends Context.Service<
  ClickUpWorkflowStore,
  {
    readonly list: (
      task: ClickUpTaskInput,
    ) => Effect.Effect<ReadonlyArray<ClickUpHandoff>, ClickUpError>;
    readonly save: (
      task: ClickUpTaskInput,
      handoff: ClickUpHandoff,
    ) => Effect.Effect<void, ClickUpError>;
    readonly postOnce: (
      task: ClickUpTaskInput,
      key: string,
      text: string,
    ) => Effect.Effect<void, ClickUpError>;
    readonly registered: (task: ClickUpTaskInput) => Effect.Effect<
      ReadonlyArray<{
        threadId: ThreadId;
        projectId: string;
        host: string;
        repository: string;
        number: number;
        url: string;
      }>,
      ClickUpError
    >;
  }
>()("t3/clickup/ClickUpWorkflowStore") {}

export const layer = Layer.effect(
  ClickUpWorkflowStore,
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const interactions = yield* ClickUpInteractions;
    const failed = () =>
      new ClickUpError({ message: "Could not persist the ClickUp workflow receipt." });
    const list = Effect.fn("ClickUpWorkflowStore.list")(function* (task: ClickUpTaskInput) {
      const rows = yield* sql<{
        handoff: string;
      }>`SELECT handoff_json AS handoff FROM clickup_workflow_handoffs
      WHERE workspace_id = ${task.workspaceId} AND task_id = ${task.taskId} AND user_id = ${task.userId}
      ORDER BY rowid DESC`.pipe(Effect.mapError(failed));
      return yield* decodeHandoffs(rows.map((row) => row.handoff)).pipe(Effect.mapError(failed));
    });
    const save = Effect.fn("ClickUpWorkflowStore.save")(function* (
      task: ClickUpTaskInput,
      handoff: ClickUpHandoff,
    ) {
      const encoded = yield* encodeHandoff(handoff).pipe(Effect.mapError(failed));
      yield* sql`INSERT INTO clickup_workflow_handoffs(id, workspace_id, task_id, user_id, thread_id, handoff_json)
      VALUES (${handoff.id}, ${task.workspaceId}, ${task.taskId}, ${task.userId}, ${handoff.threadId}, ${encoded})
      ON CONFLICT(id) DO UPDATE SET handoff_json = excluded.handoff_json`.pipe(
        Effect.mapError(failed),
      );
    });
    const postOnce = Effect.fn("ClickUpWorkflowStore.postOnce")(function* (
      task: ClickUpTaskInput,
      key: string,
      text: string,
    ) {
      const operation = NodeCrypto.createHash("sha256").update(key).digest("hex");
      const existing = yield* sql<{ state: string }>`SELECT state FROM clickup_workflow_comments
      WHERE workspace_id = ${task.workspaceId} AND task_id = ${task.taskId} AND user_id = ${task.userId} AND operation_key = ${operation}`.pipe(
        Effect.mapError(failed),
      );
      if (existing[0]?.state === "posted") return;
      if (existing.length)
        return yield* new ClickUpError({
          message:
            "Comment delivery is uncertain. Check ClickUp before any manual retry; automatic reposting is disabled.",
        });
      // Reserve before sending: a lost response must never turn a retry into a duplicate comment.
      yield* sql`INSERT INTO clickup_workflow_comments(workspace_id, task_id, user_id, operation_key, state)
      VALUES (${task.workspaceId}, ${task.taskId}, ${task.userId}, ${operation}, 'sending')`.pipe(
        Effect.mapError(failed),
      );
      yield* interactions.createComment({ ...task, text }).pipe(
        Effect.mapError(
          () =>
            new ClickUpError({
              message:
                "Comment delivery is uncertain. Check ClickUp; automatic reposting is disabled.",
            }),
        ),
      );
      yield* sql`UPDATE clickup_workflow_comments SET state = 'posted' WHERE workspace_id = ${task.workspaceId}
      AND task_id = ${task.taskId} AND user_id = ${task.userId} AND operation_key = ${operation}`.pipe(
        Effect.mapError(failed),
      );
    });
    const registered = (task: ClickUpTaskInput) =>
      sql<{
        threadId: ThreadId;
        projectId: string;
        host: string;
        repository: string;
        number: number;
        url: string;
      }>`
    SELECT p.thread_id AS "threadId", t.project_id AS "projectId", p.host, p.repository, p.number, p.url
    FROM projection_thread_pull_requests p JOIN projection_threads t ON p.thread_id = t.thread_id
    JOIN projection_thread_clickup_tasks c ON c.thread_id = t.thread_id
    WHERE c.workspace_id = ${task.workspaceId} AND c.task_id = ${task.taskId} AND t.deleted_at IS NULL
  `.pipe(Effect.mapError(failed));
    return ClickUpWorkflowStore.of({ list, save, postOnce, registered });
  }),
);
