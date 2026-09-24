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
export type ClickUpUser = typeof ClickUpUser.Type;
export const ClickUpAttachment = Schema.Struct({
  name: Schema.String,
  url: Schema.String,
  mimeType: Schema.optional(Schema.NullOr(Schema.String)),
  extension: Schema.optional(Schema.NullOr(Schema.String)),
  thumbnailUrl: Schema.optional(Schema.NullOr(Schema.String)),
});
export type ClickUpAttachment = typeof ClickUpAttachment.Type;
export const ClickUpComment = Schema.Struct({
  id: Schema.String,
  author: Schema.String,
  text: Schema.String,
  createdAt: Schema.optional(Schema.NullOr(Schema.String)),
  avatarUrl: Schema.optional(Schema.NullOr(Schema.String)),
  replyCount: Schema.optional(Schema.NullOr(Schema.Number)),
  assignee: Schema.optional(Schema.NullOr(ClickUpUser)),
  mentionedUserIds: Schema.optional(Schema.Array(Schema.Int)),
  resolved: Schema.optional(Schema.Boolean),
  attachments: Schema.optional(Schema.Array(ClickUpAttachment)),
});
export type ClickUpComment = typeof ClickUpComment.Type;
export const ClickUpWorkspace = Schema.Struct({ id: ClickUpId, name: Schema.String });
export const ClickUpConnection = Schema.Struct({
  configured: Schema.Boolean,
  user: Schema.NullOr(ClickUpUser),
  workspaces: Schema.Array(ClickUpWorkspace),
});
export type ClickUpConnection = typeof ClickUpConnection.Type;

export const ClickUpTaskSource = Schema.Struct({
  kind: Schema.Literals(["project", "list", "folder", "space"]),
  id: ClickUpId,
  fieldId: Schema.optional(ClickUpId),
  name: Schema.String,
  color: Schema.optional(Schema.NullOr(Schema.String)),
});
export type ClickUpTaskSource = typeof ClickUpTaskSource.Type;

export const ClickUpTask = Schema.Struct({
  ...ClickUpTaskReference.fields,
  status: Schema.String,
  timeEstimate: Schema.optional(Schema.NullOr(Schema.Number)),
  statusColor: Schema.optional(Schema.NullOr(Schema.String)),
  priority: Schema.optional(Schema.NullOr(Schema.String)),
  dueDate: Schema.optional(Schema.NullOr(Schema.String)),
  tags: Schema.optional(Schema.Array(Schema.String)),
  listName: Schema.String,
  sources: Schema.optional(Schema.Array(ClickUpTaskSource)),
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
  listId: Schema.optional(ClickUpId),
  showAll: Schema.optional(Schema.Boolean),
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
  metadata: Schema.optional(
    Schema.Struct({
      assignees: Schema.Array(ClickUpUser),
      creator: Schema.NullOr(ClickUpUser),
      watchers: Schema.Array(ClickUpUser),
      priority: Schema.NullOr(Schema.String),
      startDate: Schema.NullOr(Schema.String),
      dueDate: Schema.NullOr(Schema.String),
      createdAt: Schema.NullOr(Schema.String),
      updatedAt: Schema.NullOr(Schema.String),
      closedAt: Schema.NullOr(Schema.String),
      timeEstimate: Schema.NullOr(Schema.Number),
      timeSpent: Schema.NullOr(Schema.Number),
      tags: Schema.Array(Schema.String),
      customFields: Schema.Array(
        Schema.Struct({
          id: Schema.String,
          name: Schema.String,
          type: Schema.String,
          valueText: Schema.NullOr(Schema.String),
        }),
      ),
      checklists: Schema.Array(
        Schema.Struct({
          id: Schema.String,
          name: Schema.String,
          items: Schema.Array(
            Schema.Struct({
              id: Schema.String,
              name: Schema.String,
              resolved: Schema.Boolean,
              assignee: Schema.optional(Schema.NullOr(ClickUpUser)),
            }),
          ),
        }),
      ),
      subtasks: Schema.Array(
        Schema.Struct({ id: Schema.String, name: Schema.String, status: Schema.String }),
      ),
      relatedTasks: Schema.Array(Schema.Struct({ id: Schema.String, label: Schema.String })),
    }),
  ),
  comments: Schema.Array(ClickUpComment),
  commentsMayHaveMore: Schema.Boolean,
  attachments: Schema.Array(ClickUpAttachment),
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
