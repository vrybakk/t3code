import { ClickUpError, ClickUpTaskInput } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import { ClickUpConnection } from "../../../clickup/ClickUpConnection.ts";
import { ClickUpTasks } from "../../../clickup/ClickUpTasks.ts";
import { ClickUpTaskEditing } from "../../../clickup/ClickUpTaskEditing.ts";
import { requireMcpCapability } from "../../McpInvocationContext.ts";
import { ClickUpToolkit } from "./tools.ts";

const decodeTaskInput = Schema.decodeUnknownEffect(ClickUpTaskInput);

const make = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const connection = yield* ClickUpConnection;
  const tasks = yield* ClickUpTasks;
  const editing = yield* ClickUpTaskEditing;
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
    get_linked_clickup_task: () => linkedTask().pipe(Effect.flatMap(tasks.detail)),
    complete_clickup_estimation: (input) =>
      linkedTask().pipe(
        Effect.flatMap((task) => editing.completeEstimation({ ...task, ...input })),
      ),
  });
});

export const ClickUpToolkitHandlersLive = ClickUpToolkit.toLayer(make);
