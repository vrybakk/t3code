import type { ClickUpCommentsPage } from "@t3tools/contracts";
import { ApiComment, normalizeAttachment, normalizeUser, nullableNumber } from "./ClickUpApi.ts";

export const normalizeComment = (comment: typeof ApiComment.Type) => ({
  id: String(comment.id),
  author: comment.user.username ?? String(comment.user.id),
  text: comment.comment_text,
  createdAt: comment.date ?? null,
  avatarUrl: comment.user.profilePicture ?? null,
  replyCount: nullableNumber(comment.reply_count),
  assignee: comment.assignee ? normalizeUser(comment.assignee) : null,
  mentionedUserIds: [
    ...new Set(
      (comment.comment ?? []).flatMap((block) =>
        block.type === "tag" && block.user ? [block.user.id] : [],
      ),
    ),
  ],
  resolved: comment.resolved ?? false,
  attachments: (comment.comment ?? []).flatMap((block) =>
    [block.attachment, block.image, block.video]
      .filter((attachment) => attachment != null)
      .map(normalizeAttachment),
  ),
});

export function normalizeCommentsPage(
  comments: ReadonlyArray<typeof ApiComment.Type>,
): ClickUpCommentsPage {
  const last = comments.at(-1);
  const nextCursor =
    comments.length === 25 && last?.date && /^\d{1,20}$/.test(last.date)
      ? { id: String(last.id), date: last.date }
      : null;
  return { comments: comments.map(normalizeComment), hasMore: nextCursor !== null, nextCursor };
}
