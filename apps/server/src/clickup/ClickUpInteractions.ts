import {
  ClickUpError,
  type ClickUpCommentsInput,
  type ClickUpCommentsPage,
  type ClickUpCreateCommentInput,
  type ClickUpCommentRepliesInput,
  type ClickUpCommentReplies,
  type ClickUpCreateReplyInput,
  type ClickUpSetCommentResolutionInput,
  type ClickUpSetChecklistItemResolutionInput,
  type ClickUpTaskInput,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import { ApiComment, ClickUpApi, decodeResponse } from "./ClickUpApi.ts";
import { ApiTaskDetails } from "./ClickUpTaskDetails.ts";
import { ClickUpConnection } from "./ClickUpConnection.ts";
import { normalizeComment, normalizeCommentsPage } from "./ClickUpCommentData.ts";

const CommentResponse = Schema.Struct({ comments: Schema.Array(ApiComment) });

export class ClickUpInteractions extends Context.Service<
  ClickUpInteractions,
  {
    readonly createComment: (input: ClickUpCreateCommentInput) => Effect.Effect<void, ClickUpError>;
    readonly replies: (
      input: ClickUpCommentRepliesInput,
    ) => Effect.Effect<ClickUpCommentReplies, ClickUpError>;
    readonly createReply: (input: ClickUpCreateReplyInput) => Effect.Effect<void, ClickUpError>;
    readonly comments: (
      input: ClickUpCommentsInput,
    ) => Effect.Effect<ClickUpCommentsPage, ClickUpError>;
    readonly setCommentResolution: (
      input: ClickUpSetCommentResolutionInput,
    ) => Effect.Effect<void, ClickUpError>;
    readonly setChecklistItemResolution: (
      input: ClickUpSetChecklistItemResolutionInput,
    ) => Effect.Effect<void, ClickUpError>;
  }
>()("t3/clickup/ClickUpInteractions") {}

export const layer = Layer.effect(
  ClickUpInteractions,
  Effect.gen(function* () {
    const api = yield* ClickUpApi;
    const connection = yield* ClickUpConnection;
    const authorizedTask = Effect.fn("ClickUpInteractions.authorizedTask")(function* (
      input: ClickUpTaskInput,
    ) {
      const { token, connection: account } = yield* connection.account;
      if (
        account.user?.id !== input.userId ||
        !account.workspaces.some((workspace) => workspace.id === input.workspaceId)
      ) {
        return yield* new ClickUpError({
          message: "The ClickUp account or workspace changed. Refresh the connection.",
        });
      }
      const task = yield* api
        .request(`task/${encodeURIComponent(input.taskId)}`, { token })
        .pipe(Effect.flatMap(decodeResponse(ApiTaskDetails)));
      if (task.id !== input.taskId || task.team_id !== input.workspaceId) {
        return yield* new ClickUpError({
          message: "This task belongs to a different ClickUp workspace.",
        });
      }
      return { token, task };
    });
    const commentPage = Effect.fn("ClickUpInteractions.commentPage")(function* (
      input: ClickUpCommentsInput,
      token: string,
    ) {
      const query = input.cursor
        ? `?${new URLSearchParams({ start_id: input.cursor.id, start: input.cursor.date })}`
        : "";
      return yield* api
        .request(`task/${encodeURIComponent(input.taskId)}/comment${query}`, { token })
        .pipe(Effect.flatMap(decodeResponse(CommentResponse)));
    });
    const comments = Effect.fn("ClickUpInteractions.comments")(function* (
      input: ClickUpCommentsInput,
    ) {
      const { token } = yield* authorizedTask(input);
      const page = yield* commentPage(input, token);
      return normalizeCommentsPage(page.comments);
    });
    const authorizedComment = Effect.fn("ClickUpInteractions.authorizedComment")(function* (
      input: ClickUpCommentRepliesInput,
    ) {
      const { token } = yield* authorizedTask(input);
      const page = yield* commentPage(input, token);
      if (!page.comments.some((comment) => String(comment.id) === input.commentId)) {
        return yield* new ClickUpError({
          message:
            "This comment is no longer on the selected task page. Refresh comments before trying again.",
        });
      }
      return token;
    });
    const createComment = Effect.fn("ClickUpInteractions.createComment")(function* (
      input: ClickUpCreateCommentInput,
    ) {
      const { token } = yield* authorizedTask(input);
      yield* api.request(`task/${encodeURIComponent(input.taskId)}/comment`, {
        token,
        method: "POST",
        body: { comment_text: input.text, notify_all: false },
      });
    });
    const replies = Effect.fn("ClickUpInteractions.replies")(function* (
      input: ClickUpCommentRepliesInput,
    ) {
      const token = yield* authorizedComment(input);
      const response = yield* api
        .request(`comment/${encodeURIComponent(input.commentId)}/reply`, { token })
        .pipe(Effect.flatMap(decodeResponse(CommentResponse)));
      return {
        comments: response.comments
          .map(normalizeComment)
          .toSorted((a, b) => Number(a.createdAt ?? 0) - Number(b.createdAt ?? 0)),
      };
    });
    const createReply = Effect.fn("ClickUpInteractions.createReply")(function* (
      input: ClickUpCreateReplyInput,
    ) {
      const token = yield* authorizedComment(input);
      yield* api.request(`comment/${encodeURIComponent(input.commentId)}/reply`, {
        token,
        method: "POST",
        body: { comment_text: input.text, notify_all: false },
      });
    });
    const setCommentResolution = Effect.fn("ClickUpInteractions.setCommentResolution")(function* (
      input: ClickUpSetCommentResolutionInput,
    ) {
      const token = yield* authorizedComment(input);
      // Do not replay comment_text: its plain-text projection loses rich formatting and media.
      yield* api.request(`comment/${encodeURIComponent(input.commentId)}`, {
        token,
        method: "PUT",
        body: { resolved: input.resolved },
      });
    });
    const setChecklistItemResolution = Effect.fn("ClickUpInteractions.setChecklistItemResolution")(
      function* (input: ClickUpSetChecklistItemResolutionInput) {
        const { token, task } = yield* authorizedTask(input);
        const checklist = task.checklists?.find((checklist) => checklist.id === input.checklistId);
        if (!checklist?.items?.some((item) => item.id === input.itemId)) {
          return yield* new ClickUpError({
            message:
              "This checklist item is no longer on the selected task. Refresh the task before trying again.",
          });
        }
        yield* api.request(
          `checklist/${encodeURIComponent(input.checklistId)}/checklist_item/${encodeURIComponent(input.itemId)}`,
          { token, method: "PUT", body: { resolved: input.resolved } },
        );
      },
    );
    return ClickUpInteractions.of({
      comments,
      createComment,
      replies,
      createReply,
      setCommentResolution,
      setChecklistItemResolution,
    });
  }),
);
