import { assert, it } from "@effect/vitest";
import {
  ClickUpError,
  ClickUpCreateCommentInput,
  ClickUpCreateReplyInput,
} from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { ClickUpApi } from "./ClickUpApi.ts";
import { ClickUpConnection } from "./ClickUpConnection.ts";
import { ClickUpInteractions, layer } from "./ClickUpInteractions.ts";

const input = { taskId: "task-1", workspaceId: "42", userId: 17 };
const task = {
  id: "task-1",
  team_id: "42",
  name: "Task",
  status: { status: "open" },
  list: { name: "Sprint" },
  checklists: [
    { id: "check-1", name: "QA", items: [{ id: "item-1", name: "Test mobile", resolved: false }] },
  ],
};
const comment = {
  id: "comment-1",
  date: "1700000000000",
  user: { id: 17, username: "Developer" },
  comment_text: "Original rich content",
  resolved: false,
};
type RequestOptions = Parameters<ClickUpApi["Service"]["request"]>[1];

function setup(
  options: {
    task?: unknown;
    comments?: ReadonlyArray<unknown>;
    replies?: ReadonlyArray<unknown>;
    failPut?: boolean;
    failPost?: boolean;
  } = {},
) {
  const calls: Array<{ path: string; options: RequestOptions }> = [];
  return {
    calls,
    layer: layer.pipe(
      Layer.provide(
        Layer.mock(ClickUpConnection)({
          account: Effect.succeed({
            token: "fixture-token",
            connection: {
              configured: true,
              user: { id: 17, username: "Developer" },
              workspaces: [{ id: "42", name: "Studio" }],
            },
          }),
        }),
      ),
      Layer.provide(
        Layer.succeed(ClickUpApi, {
          request: (path, requestOptions) => {
            calls.push({ path, options: requestOptions });
            if (requestOptions?.method === "POST")
              return options.failPost
                ? Effect.fail(new ClickUpError({ message: "Connection lost" }))
                : Effect.succeed({ id: "created" });
            if (path.endsWith("/reply")) return Effect.succeed({ comments: options.replies ?? [] });
            if (requestOptions?.method === "PUT")
              return options.failPut
                ? Effect.fail(
                    new ClickUpError({ message: "ClickUp request failed (400). Try again." }),
                  )
                : Effect.succeed({});
            return Effect.succeed(
              path.startsWith("task/task-1/comment")
                ? { comments: options.comments ?? [comment] }
                : (options.task ?? task),
            );
          },
        }),
      ),
    ),
  };
}

const decodeCreateComment = Schema.decodeUnknownSync(ClickUpCreateCommentInput);
const decodeCreateReply = Schema.decodeUnknownSync(ClickUpCreateReplyInput);
it("rejects blank and oversized comments while preserving multiline text", () => {
  for (const text of ["", " \n ", "x".repeat(10_001)]) {
    assert.throws(() => decodeCreateComment({ ...input, text }));
    assert.throws(() => decodeCreateReply({ ...input, commentId: "comment-1", text }));
  }
  assert.equal(
    decodeCreateComment({ ...input, text: "First\n  code\nLast" }).text,
    "First\n  code\nLast",
  );
});

it.effect(
  "creates comments and replies with exact text after validating task and parent membership",
  () => {
    const test = setup();
    return Effect.gen(function* () {
      const service = yield* ClickUpInteractions;
      yield* service.createComment({ ...input, text: "First\nSecond" });
      yield* service.createReply({
        ...input,
        commentId: "comment-1",
        text: "Reply",
        cursor: { id: "newer", date: "1700100000000" },
      });
      assert.deepEqual(
        test.calls.filter((call) => call.options?.method === "POST"),
        [
          {
            path: "task/task-1/comment",
            options: {
              token: "fixture-token",
              method: "POST",
              body: { comment_text: "First\nSecond", notify_all: false },
            },
          },
          {
            path: "comment/comment-1/reply",
            options: {
              token: "fixture-token",
              method: "POST",
              body: { comment_text: "Reply", notify_all: false },
            },
          },
        ],
      );
      assert.isTrue(
        test.calls.some(
          (call) =>
            call.path.includes("start_id=newer") && call.path.includes("start=1700100000000"),
        ),
      );
    }).pipe(Effect.provide(test.layer));
  },
);

it.effect(
  "rejects comments for a changed account or workspace and replies to unrelated parents",
  () => {
    const test = setup({ comments: [] });
    return Effect.gen(function* () {
      const service = yield* ClickUpInteractions;
      for (const operation of [
        service.createComment({ ...input, userId: 99, text: "No" }),
        service.createComment({ ...input, workspaceId: "other", text: "No" }),
        service.createReply({ ...input, commentId: "other-comment", text: "No" }),
        service.replies({ ...input, commentId: "other-comment" }),
      ])
        assert.equal((yield* Effect.result(operation))._tag, "Failure");
      assert.isFalse(
        test.calls.some((call) => call.options?.method === "POST" || call.path.endsWith("/reply")),
      );
    }).pipe(Effect.provide(test.layer));
  },
);

it.effect("returns replies chronologically with mention and assignment context", () => {
  const test = setup({
    replies: [
      {
        ...comment,
        id: "later",
        date: "1700100000000",
        assignee: { id: 17, username: "Developer" },
        comment: [{ type: "tag", user: { id: 17 } }],
      },
      { ...comment, id: "earlier", date: "1700000000000" },
    ],
  });
  return Effect.gen(function* () {
    const service = yield* ClickUpInteractions;
    const result = yield* service.replies({ ...input, commentId: "comment-1" });
    assert.deepEqual(
      result.comments.map((reply) => reply.id),
      ["earlier", "later"],
    );
    assert.deepEqual(result.comments[1]?.mentionedUserIds, [17]);
    assert.equal(result.comments[1]?.assignee?.id, 17);
  }).pipe(Effect.provide(test.layer));
});

it.effect("does not retry a failed comment or reply POST", () => {
  const test = setup({ failPost: true });
  return Effect.gen(function* () {
    const service = yield* ClickUpInteractions;
    assert.equal(
      (yield* Effect.result(service.createComment({ ...input, text: "Once" })))._tag,
      "Failure",
    );
    assert.equal(
      (yield* Effect.result(
        service.createReply({ ...input, commentId: "comment-1", text: "Once" }),
      ))._tag,
      "Failure",
    );
    assert.equal(test.calls.filter((call) => call.options?.method === "POST").length, 2);
  }).pipe(Effect.provide(test.layer));
});

it.effect("resolves and reopens comments using only the resolved field", () => {
  const test = setup();
  return Effect.gen(function* () {
    const interactions = yield* ClickUpInteractions;
    for (const resolved of [true, false])
      yield* interactions.setCommentResolution({ ...input, commentId: "comment-1", resolved });
    assert.deepEqual(
      test.calls.filter((call) => call.options?.method === "PUT"),
      [
        {
          path: "comment/comment-1",
          options: { token: "fixture-token", method: "PUT", body: { resolved: true } },
        },
        {
          path: "comment/comment-1",
          options: { token: "fixture-token", method: "PUT", body: { resolved: false } },
        },
      ],
    );
  }).pipe(Effect.provide(test.layer));
});

it.effect("uses the selected page cursor to validate an older assigned comment", () => {
  const test = setup();
  return Effect.gen(function* () {
    const interactions = yield* ClickUpInteractions;
    yield* interactions.setCommentResolution({
      ...input,
      commentId: "comment-1",
      resolved: true,
      cursor: { id: "newer-comment", date: "1700100000000" },
    });
    const url = new URL(`https://example.test/${test.calls[1]?.path}`);
    assert.equal(url.searchParams.get("start_id"), "newer-comment");
    assert.equal(url.searchParams.get("start"), "1700100000000");
  }).pipe(Effect.provide(test.layer));
});

it.effect("updates only the selected checklist item's resolution", () => {
  const test = setup();
  return Effect.gen(function* () {
    const interactions = yield* ClickUpInteractions;
    yield* interactions.setChecklistItemResolution({
      ...input,
      checklistId: "check-1",
      itemId: "item-1",
      resolved: true,
    });
    assert.deepEqual(test.calls.at(-1), {
      path: "checklist/check-1/checklist_item/item-1",
      options: { token: "fixture-token", method: "PUT", body: { resolved: true } },
    });
  }).pipe(Effect.provide(test.layer));
});

it.effect("rejects changed users and unauthorized workspaces before fetching or writing", () => {
  const test = setup();
  return Effect.gen(function* () {
    const interactions = yield* ClickUpInteractions;
    for (const selected of [
      { ...input, userId: 99 },
      { ...input, workspaceId: "other" },
    ]) {
      assert.equal(
        (yield* Effect.result(
          interactions.setCommentResolution({
            ...selected,
            commentId: "comment-1",
            resolved: true,
          }),
        ))._tag,
        "Failure",
      );
    }
    assert.deepEqual(test.calls, []);
  }).pipe(Effect.provide(test.layer));
});

it.effect("rejects a task returned from another workspace", () => {
  const test = setup({ task: { ...task, team_id: "other" } });
  return Effect.gen(function* () {
    const interactions = yield* ClickUpInteractions;
    assert.equal(
      (yield* Effect.result(
        interactions.setCommentResolution({ ...input, commentId: "comment-1", resolved: true }),
      ))._tag,
      "Failure",
    );
    assert.equal(test.calls.length, 1);
  }).pipe(Effect.provide(test.layer));
});

it.effect("rejects a response for a different task before updating a checklist", () => {
  const test = setup({ task: { ...task, id: "different-task" } });
  return Effect.gen(function* () {
    const interactions = yield* ClickUpInteractions;
    assert.equal(
      (yield* Effect.result(
        interactions.setChecklistItemResolution({
          ...input,
          checklistId: "check-1",
          itemId: "item-1",
          resolved: true,
        }),
      ))._tag,
      "Failure",
    );
    assert.equal(test.calls.length, 1);
  }).pipe(Effect.provide(test.layer));
});

it.effect("rejects comments and checklist items that do not belong to the selected task", () => {
  const test = setup();
  return Effect.gen(function* () {
    const interactions = yield* ClickUpInteractions;
    assert.equal(
      (yield* Effect.result(
        interactions.setCommentResolution({ ...input, commentId: "elsewhere", resolved: true }),
      ))._tag,
      "Failure",
    );
    for (const selection of [
      { checklistId: "elsewhere", itemId: "item-1" },
      { checklistId: "check-1", itemId: "elsewhere" },
    ]) {
      assert.equal(
        (yield* Effect.result(
          interactions.setChecklistItemResolution({ ...input, ...selection, resolved: true }),
        ))._tag,
        "Failure",
      );
    }
    assert.equal(
      test.calls.some((call) => call.options?.method === "PUT"),
      false,
    );
  }).pipe(Effect.provide(test.layer));
});

it.effect("surfaces provider rejection without retrying or rewriting comment text", () => {
  const test = setup({ failPut: true });
  return Effect.gen(function* () {
    const interactions = yield* ClickUpInteractions;
    const result = yield* Effect.result(
      interactions.setCommentResolution({ ...input, commentId: "comment-1", resolved: true }),
    );
    assert.equal(result._tag, "Failure");
    assert.equal(test.calls.filter((call) => call.options?.method === "PUT").length, 1);
  }).pipe(Effect.provide(test.layer));
});

it.effect("returns a usable next cursor for full comment pages and none for the last page", () => {
  const comments = Array.from({ length: 25 }, (_, index) => ({
    ...comment,
    id: `comment-${index}`,
    date: String(1700000000000 - index),
  }));
  const test = setup({ comments });
  return Effect.gen(function* () {
    const interactions = yield* ClickUpInteractions;
    const page = yield* interactions.comments(input);
    assert.equal(page.hasMore, true);
    assert.deepEqual(page.nextCursor, { id: "comment-24", date: "1699999999976" });
    assert.equal(page.comments.length, 25);
  }).pipe(Effect.provide(test.layer));
});

it.effect("does not invent a cursor for an incomplete comment page", () => {
  const test = setup();
  return Effect.gen(function* () {
    const interactions = yield* ClickUpInteractions;
    const page = yield* interactions.comments(input);
    assert.equal(page.hasMore, false);
    assert.equal(page.nextCursor, null);
  }).pipe(Effect.provide(test.layer));
});
