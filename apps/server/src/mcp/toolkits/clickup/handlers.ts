import { readClickUpWorkflowContext } from "../../../clickup/ClickUpWorkflowContext.ts";
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
const encodeTaskSelectors = Schema.encodeSync(
  Schema.fromJsonString(
    Schema.Array(Schema.Struct({ workspaceId: Schema.String, taskId: Schema.String })),
  ),
);

const make = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const connection = yield* ClickUpConnection;
  const tasks = yield* ClickUpTasks;
  const interactions = yield* ClickUpInteractions;
  const editing = yield* ClickUpTaskEditing;
  const workflow = yield* ClickUpWorkflow;
  const linkedTask = Effect.fn("ClickUpToolkit.linkedTask")(function* (
    target?: Pick<ClickUpTaskInput, "workspaceId" | "taskId">,
  ) {
    const scope = yield* requireMcpCapability("clickup");
    const rows = yield* sql<{ workspaceId: string; taskId: string; isPrimary: number }>`
      SELECT tasks.workspace_id AS "workspaceId", tasks.task_id AS "taskId", tasks.is_primary AS "isPrimary"
      FROM projection_thread_clickup_tasks AS tasks
      JOIN projection_threads AS threads ON threads.thread_id = tasks.thread_id
      WHERE tasks.thread_id = ${scope.threadId} AND threads.deleted_at IS NULL
        AND ${
          target
            ? sql`tasks.workspace_id = ${target.workspaceId} AND tasks.task_id = ${target.taskId}`
            : sql`1 = 1`
        }
    `.pipe(
      Effect.mapError(
        () => new ClickUpError({ message: "Could not read this thread's linked ClickUp task." }),
      ),
    );
    const link = target
      ? rows[0]
      : (rows.find((row) => row.isPrimary === 1) ?? (rows.length === 1 ? rows[0] : undefined));
    if (!target && !link && rows.length > 1)
      return yield* new ClickUpError({
        message: `Multiple ClickUp tasks are linked and no primary task is set. Select the intended task and pass task: { workspaceId, taskId } on every workflow call. Linked tasks: ${encodeTaskSelectors(rows.map(({ workspaceId, taskId }) => ({ workspaceId, taskId })))}`,
      });
    if (!link)
      return yield* new ClickUpError({
        message: target
          ? "The selected ClickUp task is not linked to this thread."
          : "This thread has no linked ClickUp task.",
      });
    const { connection: account } = yield* connection.account;
    if (!account.user)
      return yield* new ClickUpError({
        message: "Connect your ClickUp account in Settings first.",
      });
    return yield* decodeTaskInput({
      workspaceId: link.workspaceId,
      taskId: link.taskId,
      userId: account.user.id,
    }).pipe(
      Effect.mapError(
        () => new ClickUpError({ message: "The linked task reference could not be read." }),
      ),
    );
  });
  return ClickUpToolkit.of({
    get_studio_task_workflow: (input) =>
      Effect.gen(function* () {
        const task = yield* linkedTask(input.task).pipe(Effect.flatMap(tasks.detail));
        const scope = yield* requireMcpCapability("clickup");
        const context = yield* readClickUpWorkflowContext(task.task, scope.threadId);
        const instructions = getStudioTaskWorkflow(input.mode);
        return { ...instructions, instructions: `${instructions.instructions}\n\n${context}` };
      }),
    start_linked_clickup_implementation: (input) =>
      linkedTask(input.task).pipe(Effect.flatMap(workflow.start)),
    post_linked_clickup_findings: (input) =>
      linkedTask(input.task).pipe(Effect.flatMap((task) => workflow.findings(task, input))),
    prepare_linked_clickup_handoff: (input) =>
      Effect.gen(function* () {
        const task = yield* linkedTask(input.task);
        const scope = yield* requireMcpCapability("clickup");
        return yield* workflow.prepare(task, scope.threadId, input);
      }),
    get_linked_clickup_task: (input) => linkedTask(input.task).pipe(Effect.flatMap(tasks.detail)),
    get_linked_clickup_comments: (input) =>
      linkedTask(input.task).pipe(
        Effect.flatMap((task) => interactions.comments({ ...task, cursor: input.cursor })),
      ),
    get_linked_clickup_comment_replies: (input) =>
      linkedTask(input.task).pipe(
        Effect.flatMap((task) =>
          interactions.replies({ ...task, commentId: input.commentId, cursor: input.cursor }),
        ),
      ),
    complete_clickup_estimation: (input) =>
      linkedTask(input.task).pipe(
        Effect.flatMap((task) =>
          editing.completeEstimation({ ...task, estimateMinutes: input.estimateMinutes }),
        ),
      ),
  });
});

export const ClickUpToolkitHandlersLive = ClickUpToolkit.toLayer(make);
