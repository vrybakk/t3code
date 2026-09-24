import { assert, it } from "@effect/vitest";
import * as Schema from "effect/Schema";
import { ApiAttachment, ApiComment, normalizeAttachment } from "./ClickUpApi.ts";
import { normalizeComment, normalizeCommentsPage } from "./ClickUpCommentData.ts";

const decodeComment = Schema.decodeUnknownSync(ApiComment);
const decodeAttachment = Schema.decodeUnknownSync(ApiAttachment);
const base = {
  id: "comment-1",
  user: { id: 17, username: "Developer" },
  comment_text: "See recordings",
};

it("accepts the task attachment's numeric type alongside the comment image's string type", () => {
  const attachment = normalizeAttachment(
    decodeAttachment({
      title: "image.png",
      url: "https://example.test/image.png",
      type: 1,
      extension: "png",
      mimetype: "image/png",
      thumbnail_small: "https://example.test/small.png",
    }),
  );
  assert.equal(attachment.extension, "png");
  assert.equal(attachment.mimeType, "image/png");
  assert.equal(attachment.thumbnailUrl, "https://example.test/small.png");
});

it("preserves assigned comment state and normalizes live image blocks with MIME extensions", () => {
  const comment = normalizeComment(
    decodeComment({
      ...base,
      resolved: true,
      assignee: { id: 23, username: "Reviewer", profilePicture: null },
      comment: [
        {
          type: "image",
          text: "image.png",
          image: {
            id: "media-1",
            name: "image.png",
            title: "image.png",
            type: "png",
            extension: "image/png",
            url: "https://example.test/image.png",
            thumbnail_medium: "https://example.test/thumb.png",
          },
        },
      ],
    }),
  );
  assert.equal(comment.resolved, true);
  assert.deepEqual(comment.assignee, { id: 23, username: "Reviewer", avatarUrl: null });
  assert.deepEqual(comment.attachments, [
    {
      name: "image.png",
      url: "https://example.test/image.png",
      mimeType: "image/png",
      extension: "png",
      thumbnailUrl: "https://example.test/thumb.png",
    },
  ]);
});

it("reads generic attachment and video blocks without treating text as a URL", () => {
  const comment = normalizeComment(
    decodeComment({
      ...base,
      comment: [
        { text: "https://example.test/not-an-attachment.png" },
        {
          type: "attachment",
          attachment: {
            title: "demo.mp4",
            extension: "mp4",
            mimetype: "video/mp4",
            url: "https://example.test/demo.mp4",
          },
        },
        {
          type: "video",
          video: {
            name: "review.webm",
            extension: "video/webm",
            type: "webm",
            url: "https://example.test/review.webm",
          },
        },
      ],
    }),
  );
  assert.deepEqual(
    comment.attachments.map((attachment) => attachment.mimeType),
    ["video/mp4", "video/webm"],
  );
});

it("accepts missing or null media and assignments", () => {
  assert.deepEqual(normalizeComment(decodeComment(base)).attachments, []);
  const comment = normalizeComment(
    decodeComment({
      ...base,
      comment: [{ image: null, video: null, attachment: null }],
      assignee: null,
    }),
  );
  assert.deepEqual(comment.attachments, []);
  assert.equal(comment.assignee, null);
  assert.equal(comment.resolved, false);
  assert.deepEqual(normalizeComment(decodeComment({ ...base, comment: null })).attachments, []);
  assert.deepEqual(
    normalizeAttachment(
      decodeAttachment({
        title: null,
        url: "https://example.test/media",
        extension: null,
        mimetype: null,
      }),
    ),
    {
      name: "Attachment",
      url: "https://example.test/media",
      mimeType: null,
      extension: null,
      thumbnailUrl: null,
    },
  );
});

it("does not offer pagination without the provider timestamp", () => {
  const comments = Array.from({ length: 25 }, () => decodeComment(base));
  assert.equal(normalizeCommentsPage(comments).nextCursor, null);
  assert.equal(normalizeCommentsPage(comments).hasMore, false);
});
