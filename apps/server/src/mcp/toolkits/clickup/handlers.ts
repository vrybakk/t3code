import { ClickUpError, ClickUpTaskInput } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import { ClickUpConnection } from "../../../clickup/ClickUpConnection.ts";
import { ClickUpTasks } from "../../../clickup/ClickUpTasks.ts";
import { ClickUpInteractions } from "../../../clickup/ClickUpInteractions.ts";
import { ClickUpTaskEditing } from "../../../clickup/ClickUpTaskEditing.ts";
import { requireMcpCapability } from "../../McpInvocationContext.ts";
import { ClickUpWorkflow } from "../../../clickup/ClickUpWorkflow.ts";
import { getStudioTaskWorkflow } from "../../../studio/StudioTaskWorkflow.ts";
import { ClickUpToolkit } from "./tools.ts";

const decodeTaskInput = Schema.decodeUnknownEffect(ClickUpTaskInput);

const make = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const connection = yield* ClickUpConnection;
  const tasks = yield* ClickUpTasks;
  const interactions = yield* ClickUpInteractions;
  const editing = yield* ClickUpTaskEditing;
  const workflow = yield* ClickUpWorkflow;
  const linkedTask = Effect.fn("ClickUpToolkit.linkedTask")(function* () {
    const scope = yield* requireMcpCapability("clickup");
    const rows = yield* sql<{ workspaceId: string; taskId: string }>`
      SELECT tasks.workspace_id AS "workspaceId", tasks.task_id AS "taskId"
      FROM projection_thread_clickup_tasks AS tasks
      JOIN projection_threads AS threads ON threads.thread_id = tasks.thread_id
      WHERE tasks.thread_id = ${scope.threadId} AND threads.deleted_at IS NULL
    `.pipe(
      Effect.mapError(
        () => new ClickUpError({ message: "Could not read this thread's linked ClickUp task." }),
      ),
    );
    const link = rows[0];
    if (!link)
      return yield* new ClickUpError({ message: "This thread has no linked ClickUp task." });
    const { connection: account } = yield* connection.account;
    if (!account.user)
      return yield* new ClickUpError({
        message: "Connect your ClickUp account in Settings first.",
      });
    return yield* decodeTaskInput({
      ...link,
      userId: account.user.id,
    }).pipe(
      Effect.mapError(
        () => new ClickUpError({ message: "The linked task reference could not be read." }),
      ),
    );
  });
  return ClickUpToolkit.of({
    get_studio_task_workflow: (input) =>
      linkedTask().pipe(Effect.map(() => getStudioTaskWorkflow(input.mode))),
    start_linked_clickup_implementation: () => linkedTask().pipe(Effect.flatMap(workflow.start)),
    post_linked_clickup_findings: (input) =>
      linkedTask().pipe(Effect.flatMap((task) => workflow.findings(task, input))),
    prepare_linked_clickup_handoff: (input) =>
      Effect.gen(function* () {
        const task = yield* linkedTask();
        const scope = yield* requireMcpCapability("clickup");
        return yield* workflow.prepare(task, scope.threadId, input);
      }),
    get_linked_clickup_task: () => linkedTask().pipe(Effect.flatMap(tasks.detail)),
    get_linked_clickup_comments: (input) =>
      linkedTask().pipe(Effect.flatMap((task) => interactions.comments({ ...input, ...task }))),
    get_linked_clickup_comment_replies: (input) =>
      linkedTask().pipe(Effect.flatMap((task) => interactions.replies({ ...input, ...task }))),
    complete_clickup_estimation: (input) =>
      linkedTask().pipe(
        Effect.flatMap((task) => editing.completeEstimation({ ...task, ...input })),
      ),
  });
});

export const ClickUpToolkitHandlersLive = ClickUpToolkit.toLayer(make);
