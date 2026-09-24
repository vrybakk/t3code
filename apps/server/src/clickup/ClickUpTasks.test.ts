import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as NodeSqliteClient from "@t3tools/shared/nodeSqliteClient";
import { ClickUpApi } from "./ClickUpApi.ts";
import { ClickUpConnection } from "./ClickUpConnection.ts";
import { ClickUpTasks, layer } from "./ClickUpTasks.ts";

const task = {
  id: "abc",
  team_id: "42",
  name: "Fix checkout",
  status: { status: "open" },
  list: { name: "Sprint 1" },
  description: "Plain description",
  markdown_description: "**Requirements**",
};

function setup(response: (path: string) => unknown, workspaceId = "42") {
  const paths: string[] = [];
  return {
    paths,
    layer: layer.pipe(
      Layer.provide(
        Layer.mock(ClickUpConnection)({
          account: Effect.succeed({
            token: "fixture-token",
            connection: {
              configured: true,
              user: { id: 17, username: "Developer" },
              workspaces: [{ id: workspaceId, name: "Studio" }],
            },
          }),
        }),
      ),
      Layer.provide(
        Layer.succeed(ClickUpApi, {
          request: (path) =>
            Effect.sync(() => {
              paths.push(path);
              return response(path);
            }),
        }),
      ),
      Layer.provide(NodeSqliteClient.layer({ filename: ":memory:" })),
    ),
  };
}

it.effect("filters by the authenticated user, includes subtasks, and preserves pagination", () => {
  const test = setup(() => ({ tasks: [task], last_page: false }));
  return Effect.gen(function* () {
    const tasks = yield* ClickUpTasks;
    const page = yield* tasks.list({ workspaceId: "42", page: 2, userId: 17 });
    assert.equal(page.hasMore, true);
    assert.equal(page.tasks[0]?.description, "");
    const query = new URL(`https://example.test/${test.paths[0]}`).searchParams;
    assert.equal(query.get("assignees[]"), "17");
    assert.equal(query.get("page"), "2");
    assert.equal(query.get("subtasks"), "true");
    assert.equal(query.get("include_closed"), "false");
  }).pipe(Effect.provide(test.layer));
});

it.effect("does not fetch tasks for an unauthorized workspace", () => {
  const test = setup(() => ({}));
  return Effect.gen(function* () {
    const tasks = yield* ClickUpTasks;
    assert.equal(
      (yield* Effect.result(tasks.list({ workspaceId: "other", page: 0, userId: 17 })))._tag,
      "Failure",
    );
    assert.deepEqual(test.paths, []);
  }).pipe(Effect.provide(test.layer));
});

it.effect(
  "loads the validated sprint including closed and multi-list tasks for every assignee",
  () => {
    const test = setup(
      (path) =>
        path === "list/sprint-1"
          ? { folder: { id: "90122725830" } }
          : { tasks: [{ ...task, team_id: "2179724" }], last_page: true },
      "2179724",
    );
    return Effect.gen(function* () {
      const tasks = yield* ClickUpTasks;
      const page = yield* tasks.list({
        workspaceId: "2179724",
        listId: "sprint-1",
        page: 1,
        userId: 17,
      });
      assert.equal(page.hasMore, false);
      assert.equal(page.tasks.length, 1);
      assert.equal(test.paths[0], "list/sprint-1");
      const url = new URL(`https://example.test/${test.paths[1]}`);
      assert.equal(url.pathname, "/list/sprint-1/task");
      assert.equal(url.searchParams.get("page"), "1");
      assert.equal(url.searchParams.get("include_timl"), "true");
      assert.equal(url.searchParams.get("include_closed"), "true");
      assert.equal(url.searchParams.get("subtasks"), "true");
      assert.equal(url.searchParams.has("assignees[]"), false);
    }).pipe(Effect.provide(test.layer));
  },
);

it.effect("does not fetch sprint tasks outside the configured folder", () => {
  const test = setup(() => ({ folder: { id: "other" } }), "2179724");
  return Effect.gen(function* () {
    const tasks = yield* ClickUpTasks;
    assert.equal(
      (yield* Effect.result(
        tasks.list({ workspaceId: "2179724", listId: "other-list", page: 0, userId: 17 }),
      ))._tag,
      "Failure",
    );
    assert.deepEqual(test.paths, ["list/other-list"]);
  }).pipe(Effect.provide(test.layer));
});

it.effect("loads bounded comment context and rejects tasks from another workspace", () => {
  const test = setup((path) =>
    path.endsWith("/comment")
      ? {
          comments: [
            {
              id: "comment-1",
              user: {
                id: 17,
                username: "Developer",
                profilePicture: "https://example.test/avatar.png",
              },
              comment_text: "Please verify on mobile.",
              date: "1700000000000",
              reply_count: "2",
            },
          ],
        }
      : task,
  );
  return Effect.gen(function* () {
    const tasks = yield* ClickUpTasks;
    const details = yield* tasks.detail({ workspaceId: "42", taskId: "abc", userId: 17 });
    assert.equal(details.comments[0]?.text, "Please verify on mobile.");
    assert.equal(details.comments[0]?.createdAt, "1700000000000");
    assert.equal(details.comments[0]?.avatarUrl, "https://example.test/avatar.png");
    assert.equal(details.comments[0]?.replyCount, 2);
    assert.deepEqual(details.metadata?.assignees, []);
    assert.equal(
      new URL(`https://example.test/${test.paths[0]}`).searchParams.get("include_subtasks"),
      "true",
    );
    assert.deepEqual(details.attachments, []);
    assert.equal(
      (yield* Effect.result(tasks.detail({ workspaceId: "other", taskId: "abc", userId: 17 })))
        ._tag,
      "Failure",
    );
    assert.equal(test.paths.filter((path) => path.endsWith("/comment")).length, 1);
  }).pipe(Effect.provide(test.layer));
});
