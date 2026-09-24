import * as Schema from "effect/Schema";
import { ClickUpComment, ClickUpTaskInput } from "./clickup.ts";
import { TrimmedNonEmptyString } from "./baseSchemas.ts";

export const ClickUpCommentCursor = Schema.Struct({
  id: ClickUpTaskInput.fields.taskId,
  date: TrimmedNonEmptyString.check(Schema.isPattern(/^\d{1,20}$/)),
});
export type ClickUpCommentCursor = typeof ClickUpCommentCursor.Type;
export const ClickUpCommentsInput = Schema.Struct({
  ...ClickUpTaskInput.fields,
  cursor: Schema.optional(ClickUpCommentCursor),
});
export type ClickUpCommentsInput = typeof ClickUpCommentsInput.Type;
export const ClickUpCommentsPage = Schema.Struct({
  comments: Schema.Array(ClickUpComment),
  hasMore: Schema.Boolean,
  nextCursor: Schema.NullOr(ClickUpCommentCursor),
});
export type ClickUpCommentsPage = typeof ClickUpCommentsPage.Type;
export const ClickUpSetCommentResolutionInput = Schema.Struct({
  ...ClickUpCommentsInput.fields,
  commentId: ClickUpTaskInput.fields.taskId,
  resolved: Schema.Boolean,
});
export type ClickUpSetCommentResolutionInput = typeof ClickUpSetCommentResolutionInput.Type;
export const ClickUpSetChecklistItemResolutionInput = Schema.Struct({
  ...ClickUpTaskInput.fields,
  checklistId: ClickUpTaskInput.fields.taskId,
  itemId: ClickUpTaskInput.fields.taskId,
  resolved: Schema.Boolean,
});
export type ClickUpSetChecklistItemResolutionInput =
  typeof ClickUpSetChecklistItemResolutionInput.Type;
