import {
  ClickUpError,
  type ClickUpTaskDetails,
  type ClickUpTaskInput,
  type ClickUpTasksInput,
  ClickUpThreadLink,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import {
  ApiTask,
  ApiComment,
  ClickUpApi,
  decodeResponse,
  normalizeTask,
  normalizeAttachment,
} from "./ClickUpApi.ts";
import { ClickUpConnection } from "./ClickUpConnection.ts";
import { ApiTaskDetails, normalizeTaskMetadata } from "./ClickUpTaskDetails.ts";
import { validateSprintList } from "./ClickUpSprints.ts";
import { normalizeComment } from "./ClickUpCommentData.ts";

const decodeThreadLinks = Schema.decodeUnknownEffect(Schema.Array(ClickUpThreadLink));

export class ClickUpTasks extends Context.Service<
  ClickUpTasks,
  {
    readonly list: (
      input: ClickUpTasksInput,
    ) => Effect.Effect<
      { tasks: ReadonlyArray<ReturnType<typeof normalizeTask>>; hasMore: boolean },
      ClickUpError
    >;
    readonly detail: (input: ClickUpTaskInput) => Effect.Effect<ClickUpTaskDetails, ClickUpError>;
    readonly threads: (
      input: ClickUpTaskInput,
    ) => Effect.Effect<ReadonlyArray<typeof ClickUpThreadLink.Type>, ClickUpError>;
  }
>()("t3/clickup/ClickUpTasks") {}

export const layer = Layer.effect(
  ClickUpTasks,
  Effect.gen(function* () {
    const api = yield* ClickUpApi;
    const connection = yield* ClickUpConnection;
    const sql = yield* SqlClient.SqlClient;

    const list = Effect.fn("ClickUpTasks.list")(function* (input: ClickUpTasksInput) {
      const { token, connection: account } = yield* connection.account;
      if (
        !account.user ||
        account.user.id !== input.userId ||
        !account.workspaces.some((workspace) => workspace.id === input.workspaceId)
      ) {
        return yield* new ClickUpError({
          message: "Select a workspace authorized by your ClickUp account.",
        });
      }
      const query = new URLSearchParams({
        page: String(input.page),
        subtasks: "true",
        include_closed: input.listId ? "true" : "false",
        order_by: "updated",
        reverse: "true",
      });
      if (input.listId) {
        yield* validateSprintList(api, token, input.workspaceId, input.listId);
        query.set("include_timl", "true");
      }
      if (!input.listId || input.showAll !== true) {
        query.set("assignees[]", String(account.user.id));
      }
      const scope = input.listId
        ? `list/${encodeURIComponent(input.listId)}`
        : `team/${encodeURIComponent(input.workspaceId)}`;
      const response = yield* api.request(`${scope}/task?${query}`, { token }).pipe(
        Effect.flatMap(
          decodeResponse(
            Schema.Struct({
              tasks: Schema.Array(ApiTask),
              last_page: Schema.optional(Schema.Boolean),
            }),
          ),
        ),
      );
      return {
        tasks: response.tasks.map((task) => ({ ...normalizeTask(task), description: "" })),
        hasMore:
          response.last_page === undefined ? response.tasks.length === 100 : !response.last_page,
      };
    });

    const detail = Effect.fn("ClickUpTasks.detail")(function* (input: ClickUpTaskInput) {
      const { token, connection: account } = yield* connection.account;
      if (account.user?.id !== input.userId)
        return yield* new ClickUpError({
          message: "The ClickUp account changed. Refresh the connection.",
        });
      const path = `task/${encodeURIComponent(input.taskId)}`;
      const task = yield* api
        .request(`${path}?include_markdown_description=true&include_subtasks=true`, { token })
        .pipe(Effect.flatMap(decodeResponse(ApiTaskDetails)));
      if (task.team_id !== input.workspaceId)
        return yield* new ClickUpError({
          message: "This task belongs to a different ClickUp workspace.",
        });
      const { comments } = yield* api
        .request(`${path}/comment`, { token })
        .pipe(
          Effect.flatMap(decodeResponse(Schema.Struct({ comments: Schema.Array(ApiComment) }))),
        );
      return {
        task: normalizeTask(task),
        metadata: normalizeTaskMetadata(task),
        comments: comments.map(normalizeComment),
        commentsMayHaveMore: comments.length === 25,
        attachments: (task.attachments ?? []).map(normalizeAttachment),
      };
    });

    const threads = Effect.fn("ClickUpTasks.threads")(function* (input: ClickUpTaskInput) {
      const rows = yield* sql`
      SELECT threads.thread_id AS "threadId", threads.project_id AS "projectId", threads.title
      FROM projection_thread_clickup_tasks AS tasks
      JOIN projection_threads AS threads ON threads.thread_id = tasks.thread_id
      WHERE tasks.workspace_id = ${input.workspaceId} AND tasks.task_id = ${input.taskId}
        AND threads.deleted_at IS NULL
      ORDER BY threads.created_at DESC LIMIT 100
    `.pipe(
        Effect.mapError(
          () => new ClickUpError({ message: "Could not load linked coding threads." }),
        ),
      );
      return yield* decodeThreadLinks(rows).pipe(
        Effect.mapError(
          () => new ClickUpError({ message: "Could not read linked coding threads." }),
        ),
      );
    });
    return ClickUpTasks.of({ list, detail, threads });
  }),
);
