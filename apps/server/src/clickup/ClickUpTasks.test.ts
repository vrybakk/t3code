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
  time_estimate: "1800000",
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
    assert.equal(page.tasks[0]?.dueDate, null);
    assert.equal(page.tasks[0]?.timeEstimate, 1_800_000);
    assert.deepEqual(page.tasks[0]?.taskType, { id: 0, name: "Task" });
    assert.equal(
      test.paths.some((path) => path.endsWith("/custom_item")),
      false,
    );
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
        showAll: true,
      });
      assert.equal(page.hasMore, false);
      assert.equal(page.tasks.length, 1);
      assert.equal(test.paths[0], "list/sprint-1");
      const url = new URL(`https://example.test/${test.paths[1]}`);
      assert.equal(url.pathname, "/list/sprint-1/task");
      assert.equal(url.searchParams.get("page"), "0");
      assert.equal(url.searchParams.get("include_timl"), "true");
      assert.equal(url.searchParams.get("include_closed"), "true");
      assert.equal(url.searchParams.get("subtasks"), "true");
      assert.equal(url.searchParams.has("assignees[]"), false);
    }).pipe(Effect.provide(test.layer));
  },
);

it.effect("defaults sprint task pages to the connected user's assignments", () => {
  const test = setup(
    (path) =>
      path === "list/sprint-1"
        ? { folder: { id: "90122725830" } }
        : {
            tasks: [
              {
                ...task,
                team_id: "2179724",
                status: { status: "review", color: "#abc" },
                priority: { priority: "high" },
                due_date: "1790222400000",
                tags: [{ name: "estimation needed" }],
              },
            ],
            last_page: true,
          },
    "2179724",
  );
  return Effect.gen(function* () {
    const tasks = yield* ClickUpTasks;
    const page = yield* tasks.list({
      workspaceId: "2179724",
      listId: "sprint-1",
      page: 0,
      userId: 17,
    });
    const url = new URL(`https://example.test/${test.paths[1]}`);
    assert.equal(url.searchParams.get("assignees[]"), "17");
    assert.deepEqual(page.tasks[0]?.tags, ["estimation needed"]);
    assert.equal(page.tasks[0]?.statusColor, "#abc");
    assert.equal(page.tasks[0]?.priority, "high");
    assert.equal(page.tasks[0]?.dueDate, "1790222400000");
  }).pipe(Effect.provide(test.layer));
});

it.effect("collects every sprint page and deduplicates tasks before returning summaries", () => {
  const firstPage = Array.from({ length: 100 }, (_, index) => ({
    ...task,
    id: String(index),
    team_id: "2179724",
  }));
  const test = setup((path) => {
    if (path === "list/sprint-1") return { folder: { id: "90122725830" } };
    const page = new URL(`https://example.test/${path}`).searchParams.get("page");
    return page === "0"
      ? { tasks: firstPage, last_page: false }
      : {
          tasks: [
            { ...firstPage[0], priority: { priority: "urgent" } },
            { ...task, id: "100", team_id: "2179724", priority: null },
          ],
          last_page: true,
        };
  }, "2179724");
  return Effect.gen(function* () {
    const tasks = yield* ClickUpTasks;
    const result = yield* tasks.list({
      workspaceId: "2179724",
      listId: "sprint-1",
      page: 7,
      userId: 17,
    });
    assert.equal(result.hasMore, false);
    assert.equal(result.tasks.length, 101);
    assert.equal(result.tasks.find((item) => item.taskId === "0")?.priority, "urgent");
    assert.equal(result.tasks.find((item) => item.taskId === "100")?.priority, null);
    assert.isTrue(result.tasks.every((item) => item.description === ""));
    const queries = test.paths
      .slice(1)
      .map((path) => new URL(`https://example.test/${path}`).searchParams);
    assert.deepEqual(
      queries.map((query) => query.get("page")),
      ["0", "1"],
    );
    assert.isTrue(
      queries.every(
        (query) => query.get("assignees[]") === "17" && query.get("include_timl") === "true",
      ),
    );
  }).pipe(Effect.provide(test.layer));
});

it.effect("continues full sprint pages when ClickUp omits last_page", () => {
  const test = setup((path) => {
    if (path === "list/sprint-1") return { folder: { id: "90122725830" } };
    const page = new URL(`https://example.test/${path}`).searchParams.get("page");
    return {
      tasks:
        page === "0"
          ? Array.from({ length: 100 }, (_, index) => ({ ...task, id: String(index) }))
          : [],
    };
  }, "2179724");
  return Effect.gen(function* () {
    const tasks = yield* ClickUpTasks;
    const result = yield* tasks.list({
      workspaceId: "2179724",
      listId: "sprint-1",
      page: 0,
      userId: 17,
      showAll: true,
    });
    assert.equal(result.tasks.length, 100);
    assert.equal(result.hasMore, false);
    assert.equal(test.paths.length, 3);
    assert.isTrue(
      test.paths
        .slice(1)
        .every((path) => !new URL(`https://example.test/${path}`).searchParams.has("assignees[]")),
    );
  }).pipe(Effect.provide(test.layer));
});

it.effect("fails the whole sprint listing when a later page cannot be decoded", () => {
  const test = setup((path) => {
    if (path === "list/sprint-1") return { folder: { id: "90122725830" } };
    return new URL(`https://example.test/${path}`).searchParams.get("page") === "0"
      ? { tasks: [{ ...task, team_id: "2179724" }], last_page: false }
      : { tasks: null };
  }, "2179724");
  return Effect.gen(function* () {
    const tasks = yield* ClickUpTasks;
    const result = yield* Effect.result(
      tasks.list({ workspaceId: "2179724", listId: "sprint-1", page: 0, userId: 17 }),
    );
    assert.equal(result._tag, "Failure");
    assert.equal(test.paths.length, 3);
  }).pipe(Effect.provide(test.layer));
});

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

it.effect(
  "uses the home list to label the source space without losing task access when metadata is unavailable",
  () => {
    let readable = true;
    const test = setup((path) => {
      if (path === "list/home")
        return readable ? { space: { id: "space", name: "MadHeads" } } : { space: "unavailable" };
      if (path.endsWith("/comment")) return { comments: [] };
      return { ...task, list: { id: "home", name: "Backlog" }, space: { id: "space" } };
    });
    return Effect.gen(function* () {
      const tasks = yield* ClickUpTasks;
      const input = { workspaceId: "42", taskId: "abc", userId: 17 };
      const details = yield* tasks.detail(input);
      assert.equal(
        details.task.sources?.find((source) => source.kind === "space")?.name,
        "MadHeads",
      );
      readable = false;
      const fallback = yield* tasks.detail(input);
      assert.equal(fallback.task.sources?.find((source) => source.kind === "space")?.id, "space");
      assert.equal(
        fallback.task.sources?.find((source) => source.kind === "space")?.name,
        "Space space",
      );
    }).pipe(Effect.provide(test.layer));
  },
);

it.effect(
  "resolves native types once across all sprint pages without interpreting Item Type custom fields",
  () => {
    const test = setup((path) => {
      if (path === "list/sprint-1") return { folder: { id: "90122725830" } };
      if (path === "team/2179724/custom_item")
        return {
          custom_items: [
            { id: 73, name: "Bug" },
            { id: 94, name: "User Story" },
          ],
        };
      const page = new URL(`https://example.test/${path}`).searchParams.get("page");
      return {
        tasks:
          page === "0"
            ? [
                { ...task, team_id: "2179724", id: "default" },
                {
                  ...task,
                  team_id: "2179724",
                  id: "bug",
                  custom_item_id: 73,
                  custom_fields: [
                    { id: "item-type", name: "Item Type", type: "text", value: "User Story" },
                  ],
                },
              ]
            : [
                { ...task, team_id: "2179724", id: "story", custom_item_id: 94 },
                { ...task, team_id: "2179724", id: "unknown", custom_item_id: 500 },
              ],
        last_page: page === "1",
      };
    }, "2179724");
    return Effect.gen(function* () {
      const service = yield* ClickUpTasks;
      const page = yield* service.list({
        workspaceId: "2179724",
        listId: "sprint-1",
        page: 0,
        userId: 17,
      });
      assert.deepEqual(
        page.tasks.map((item) => item.taskType),
        [
          { id: 0, name: "Task" },
          { id: 73, name: "Bug" },
          { id: 94, name: "User Story" },
          { id: 500, name: "Unknown type" },
        ],
      );
      assert.equal(test.paths.filter((path) => path.endsWith("/custom_item")).length, 1);
    }).pipe(Effect.provide(test.layer));
  },
);

it.effect(
  "enriches task details and retains native IDs if optional type metadata cannot be decoded",
  () => {
    let catalogAvailable = true;
    const test = setup((path) => {
      if (path === "team/42/custom_item")
        return catalogAvailable
          ? { custom_items: [{ id: 73, name: "Bug" }] }
          : { unavailable: true };
      if (path.endsWith("/comment")) return { comments: [] };
      return {
        ...task,
        custom_item_id: 73,
        custom_fields: [{ id: "item-type", name: "Item Type", type: "text", value: "User Story" }],
      };
    });
    return Effect.gen(function* () {
      const service = yield* ClickUpTasks;
      const input = { workspaceId: "42", taskId: "abc", userId: 17 };
      const details = yield* service.detail(input);
      assert.deepEqual(details.task.taskType, { id: 73, name: "Bug" });
      assert.equal(details.metadata?.customFields[0]?.valueText, "User Story");
      catalogAvailable = false;
      assert.deepEqual((yield* service.detail(input)).task.taskType, {
        id: 73,
        name: "Unknown type",
      });
      assert.equal(test.paths.filter((path) => path.endsWith("/custom_item")).length, 2);
    }).pipe(Effect.provide(test.layer));
  },
);
