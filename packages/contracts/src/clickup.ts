import * as Schema from "effect/Schema";
import { NonNegativeInt, ProjectId, ThreadId, TrimmedNonEmptyString } from "./baseSchemas.ts";

const ClickUpId = TrimmedNonEmptyString.check(
  Schema.isPattern(/^[a-zA-Z0-9_-]+$/),
  Schema.isMaxLength(128),
);

export const ClickUpTaskReference = Schema.Struct({
  workspaceId: ClickUpId,
  taskId: ClickUpId,
  name: TrimmedNonEmptyString.check(Schema.isMaxLength(1024)),
});
export type ClickUpTaskReference = typeof ClickUpTaskReference.Type;

export const ClickUpUser = Schema.Struct({
  id: Schema.Int,
  username: Schema.String,
  avatarUrl: Schema.optional(Schema.NullOr(Schema.String)),
});
export const ClickUpWorkspace = Schema.Struct({ id: ClickUpId, name: Schema.String });
export const ClickUpConnection = Schema.Struct({
  configured: Schema.Boolean,
  user: Schema.NullOr(ClickUpUser),
  workspaces: Schema.Array(ClickUpWorkspace),
});
export type ClickUpConnection = typeof ClickUpConnection.Type;

export const ClickUpTask = Schema.Struct({
  ...ClickUpTaskReference.fields,
  status: Schema.String,
  listName: Schema.String,
  description: Schema.String,
});
export type ClickUpTask = typeof ClickUpTask.Type;

export const ClickUpTaskInput = Schema.Struct({
  workspaceId: ClickUpId,
  taskId: ClickUpId,
  userId: Schema.Int,
});
export type ClickUpTaskInput = typeof ClickUpTaskInput.Type;
export const ClickUpTasksInput = Schema.Struct({
  workspaceId: ClickUpId,
  page: NonNegativeInt,
  userId: Schema.Int,
});
export type ClickUpTasksInput = typeof ClickUpTasksInput.Type;
export const ClickUpTaskPage = Schema.Struct({
  tasks: Schema.Array(ClickUpTask),
  hasMore: Schema.Boolean,
});

export const ClickUpTaskDetails = Schema.Struct({
  task: ClickUpTask,
  comments: Schema.Array(
    Schema.Struct({ id: Schema.String, author: Schema.String, text: Schema.String }),
  ),
  commentsMayHaveMore: Schema.Boolean,
  attachments: Schema.Array(Schema.Struct({ name: Schema.String, url: Schema.String })),
});
export type ClickUpTaskDetails = typeof ClickUpTaskDetails.Type;

export const ClickUpThreadLink = Schema.Struct({
  threadId: ThreadId,
  projectId: ProjectId,
  title: Schema.String,
});

export class ClickUpError extends Schema.TaggedError<ClickUpError>()("ClickUpError", {
  message: Schema.String,
}) {}
