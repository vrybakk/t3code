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

function setup(response: (path: string) => unknown) {
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
              workspaces: [{ id: "42", name: "Studio" }],
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

it.effect("loads bounded comment context and rejects tasks from another workspace", () => {
  const test = setup((path) =>
    path.endsWith("/comment")
      ? {
          comments: [
            {
              id: "comment-1",
              user: { id: 17, username: "Developer" },
              comment_text: "Please verify on mobile.",
            },
          ],
        }
      : task,
  );
  return Effect.gen(function* () {
    const tasks = yield* ClickUpTasks;
    const details = yield* tasks.detail({ workspaceId: "42", taskId: "abc", userId: 17 });
    assert.equal(details.comments[0]?.text, "Please verify on mobile.");
    assert.deepEqual(details.attachments, []);
    assert.equal(
      (yield* Effect.result(tasks.detail({ workspaceId: "other", taskId: "abc", userId: 17 })))
        ._tag,
      "Failure",
    );
    assert.equal(test.paths.filter((path) => path.endsWith("/comment")).length, 1);
  }).pipe(Effect.provide(test.layer));
});
