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
const CommentText = Schema.String.check(
  Schema.isMinLength(1),
  Schema.isMaxLength(10_000),
  Schema.isPattern(/\S/),
);
export const ClickUpCreateCommentInput = Schema.Struct({
  ...ClickUpTaskInput.fields,
  text: CommentText,
});
export type ClickUpCreateCommentInput = typeof ClickUpCreateCommentInput.Type;
export const ClickUpCommentRepliesInput = Schema.Struct({
  ...ClickUpCommentsInput.fields,
  commentId: ClickUpTaskInput.fields.taskId,
});
export type ClickUpCommentRepliesInput = typeof ClickUpCommentRepliesInput.Type;
export const ClickUpCommentReplies = Schema.Struct({ comments: Schema.Array(ClickUpComment) });
export type ClickUpCommentReplies = typeof ClickUpCommentReplies.Type;
export const ClickUpCreateReplyInput = Schema.Struct({
  ...ClickUpCommentRepliesInput.fields,
  text: CommentText,
});
export type ClickUpCreateReplyInput = typeof ClickUpCreateReplyInput.Type;
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
