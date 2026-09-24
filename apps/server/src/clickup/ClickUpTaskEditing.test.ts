import { assert, it } from "@effect/vitest";
import { ClickUpError } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { ClickUpApi } from "./ClickUpApi.ts";
import { ClickUpConnection } from "./ClickUpConnection.ts";
import { ClickUpTaskEditing, layer } from "./ClickUpTaskEditing.ts";

const input = { taskId: "task-1", workspaceId: "42", userId: 17 };
type RequestOptions = Parameters<ClickUpApi["Service"]["request"]>[1];
function setup(
  config: {
    task?: Record<string, unknown>;
    failPut?: boolean;
    failDelete?: boolean;
    ignoreEstimate?: boolean;
  } = {},
) {
  let task = {
    id: "task-1",
    team_id: "42",
    name: "Task",
    status: { status: "open", color: "#fff" },
    list: { id: "home-list", name: "Project list" },
    space: { id: "home-space" },
    tags: [{ name: "estimation needed" }],
    time_estimate: null as number | null,
    ...config.task,
  };
  const calls: Array<{ path: string; options: RequestOptions }> = [];
  return {
    calls,
    task: () => task,
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
          request: (path, options) =>
            Effect.gen(function* () {
              calls.push({ path, options });
              if (options?.method === "PUT") {
                if (config.failPut) return yield* new ClickUpError({ message: "Update failed" });
                if (typeof options.body?.time_estimate === "number" && !config.ignoreEstimate)
                  task = { ...task, time_estimate: options.body.time_estimate };
                yield* Effect.yieldNow;
                return {};
              }
              if (options?.method === "DELETE") {
                if (config.failDelete) return yield* new ClickUpError({ message: "Remove failed" });
                const name = decodeURIComponent(path.slice(path.lastIndexOf("/") + 1));
                task = { ...task, tags: task.tags.filter((tag) => tag.name !== name) };
                return {};
              }
              if (options?.method === "POST") return {};
              if (path === "list/home-list")
                return {
                  statuses: [
                    { status: "open", color: "#fff", type: "open" },
                    { status: "review", color: "#aaa", type: "custom" },
                  ],
                };
              if (path === "space/home-space/tag")
                return {
                  tags: [
                    { name: "estimation needed", tag_bg: "#abc" },
                    { name: "needs review", tag_bg: "#def" },
                  ],
                };
              return task;
            }),
        }),
      ),
    ),
  };
}

it.effect("loads status and tag options from the task's home list and space", () => {
  const test = setup();
  return Effect.gen(function* () {
    const service = yield* ClickUpTaskEditing;
    const options = yield* service.options(input);
    assert.deepEqual(options.statuses[1], { name: "review", color: "#aaa", type: "custom" });
    assert.deepEqual(options.tags[1], { name: "needs review", color: "#def" });
    assert.deepEqual(options.currentTags, ["estimation needed"]);
    assert.equal(options.status, "open");
    assert.deepEqual(test.calls.map((call) => call.path).toSorted(), [
      "list/home-list",
      "space/home-space/tag",
      "task/task-1",
    ]);
  }).pipe(Effect.provide(test.layer));
});

it.effect("updates only a status allowed by the task's home list", () => {
  const test = setup();
  return Effect.gen(function* () {
    const service = yield* ClickUpTaskEditing;
    yield* service.setStatus({ ...input, status: "review" });
    assert.deepEqual(test.calls.at(-1), {
      path: "task/task-1",
      options: { token: "fixture-token", method: "PUT", body: { status: "review" } },
    });
    assert.equal(
      (yield* Effect.result(service.setStatus({ ...input, status: "invented" })))._tag,
      "Failure",
    );
    assert.equal(test.calls.filter((call) => call.options?.method === "PUT").length, 1);
  }).pipe(Effect.provide(test.layer));
});

it.effect("adds existing space tags and removes task tags through encoded paths", () => {
  const test = setup();
  return Effect.gen(function* () {
    const service = yield* ClickUpTaskEditing;
    yield* service.setTag({ ...input, tag: "needs review", present: true });
    assert.deepEqual(test.calls.at(-1), {
      path: "task/task-1/tag/needs%20review",
      options: { token: "fixture-token", method: "POST" },
    });
    assert.equal(
      (yield* Effect.result(service.setTag({ ...input, tag: "invented", present: true })))._tag,
      "Failure",
    );
    yield* service.setTag({ ...input, tag: "estimation needed", present: false });
    assert.equal(test.calls.at(-1)?.options?.method, "DELETE");
    yield* service.setTag({ ...input, tag: "estimation needed", present: false });
    assert.equal(test.calls.filter((call) => call.options?.method === "DELETE").length, 1);
  }).pipe(Effect.provide(test.layer));
});

it.effect("rejects another user or unauthorized workspace before fetching", () => {
  const test = setup();
  return Effect.gen(function* () {
    const service = yield* ClickUpTaskEditing;
    for (const selected of [
      { ...input, userId: 99 },
      { ...input, workspaceId: "other" },
    ])
      assert.equal(
        (yield* Effect.result(service.setStatus({ ...selected, status: "review" })))._tag,
        "Failure",
      );
    assert.deepEqual(test.calls, []);
  }).pipe(Effect.provide(test.layer));
});

it.effect("rejects a task from another workspace without writing", () => {
  const test = setup({ task: { team_id: "other" } });
  return Effect.gen(function* () {
    const service = yield* ClickUpTaskEditing;
    assert.equal(
      (yield* Effect.result(service.setTag({ ...input, tag: "needs review", present: true })))._tag,
      "Failure",
    );
    assert.equal(test.calls.length, 1);
  }).pipe(Effect.provide(test.layer));
});

it.effect("saves milliseconds and confirms them before removing the estimation tag", () => {
  const test = setup();
  return Effect.gen(function* () {
    const service = yield* ClickUpTaskEditing;
    assert.deepEqual(yield* service.completeEstimation({ ...input, estimateMinutes: 90 }), {
      estimateMinutes: 90,
      tagRemoved: true,
    });
    assert.deepEqual(
      test.calls.map((call) => call.options?.method ?? "GET"),
      ["GET", "PUT", "GET", "DELETE"],
    );
    assert.deepEqual(test.calls[1]?.options?.body, { time_estimate: 5_400_000 });
    assert.deepEqual(test.task().tags, []);
  }).pipe(Effect.provide(test.layer));
});

it.effect("does not estimate a task whose marker was removed", () => {
  const test = setup({ task: { tags: [] } });
  return Effect.gen(function* () {
    const service = yield* ClickUpTaskEditing;
    assert.equal(
      (yield* Effect.result(service.completeEstimation({ ...input, estimateMinutes: 90 })))._tag,
      "Failure",
    );
    assert.equal(test.calls.length, 1);
  }).pipe(Effect.provide(test.layer));
});

for (const failure of ["failPut", "ignoreEstimate"] as const) {
  it.effect(
    `retains the marker when estimate ${failure === "failPut" ? "saving fails" : "cannot be confirmed"}`,
    () => {
      const test = setup({ [failure]: true });
      return Effect.gen(function* () {
        const service = yield* ClickUpTaskEditing;
        assert.equal(
          (yield* Effect.result(service.completeEstimation({ ...input, estimateMinutes: 90 })))
            ._tag,
          "Failure",
        );
        assert.equal(
          test.calls.some((call) => call.options?.method === "DELETE"),
          false,
        );
        assert.deepEqual(test.task().tags, [{ name: "estimation needed" }]);
      }).pipe(Effect.provide(test.layer));
    },
  );
}

it.effect("reports partial success and avoids repeating the same estimate write on retry", () => {
  const test = setup({ failDelete: true });
  return Effect.gen(function* () {
    const service = yield* ClickUpTaskEditing;
    for (let index = 0; index < 2; index++)
      assert.deepEqual(yield* service.completeEstimation({ ...input, estimateMinutes: 90 }), {
        estimateMinutes: 90,
        tagRemoved: false,
      });
    assert.equal(test.task().time_estimate, 5_400_000);
    assert.equal(test.calls.filter((call) => call.options?.method === "PUT").length, 1);
  }).pipe(Effect.provide(test.layer));
});

it.effect("serializes estimates from concurrent linked threads and checks the marker again", () => {
  const test = setup();
  return Effect.gen(function* () {
    const service = yield* ClickUpTaskEditing;
    const results = yield* Effect.all(
      [90, 120].map((estimateMinutes) =>
        Effect.result(service.completeEstimation({ ...input, estimateMinutes })),
      ),
      { concurrency: 2 },
    );
    assert.deepEqual(
      results.map((result) => result._tag),
      ["Success", "Failure"],
    );
    assert.equal(test.calls.filter((call) => call.options?.method === "PUT").length, 1);
    assert.equal(test.task().time_estimate, 5_400_000);
  }).pipe(Effect.provide(test.layer));
});
