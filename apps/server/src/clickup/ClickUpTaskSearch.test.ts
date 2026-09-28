import { assert, it } from "@effect/vitest";
import { ClickUpError } from "@t3tools/contracts";
import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as TestClock from "effect/testing/TestClock";
import { makeTaskSearch } from "./ClickUpTaskSearch.ts";

const task = (id: string) => ({
  id,
  team_id: "42",
  name: `Task ${id}`,
  status: { status: "open" },
  list: { name: "Tasks" },
});

it.effect(
  "paces a large workspace and resumes its rate-limited page before returning matches",
  () =>
    Effect.gen(function* () {
      const requests: Array<{ page: number; at: number }> = [];
      let limited = false;
      let completed = false;
      const search = yield* makeTaskSearch({
        request: (path) =>
          Effect.gen(function* () {
            const page = Number(new URL(path, "https://fixture.test").searchParams.get("page"));
            requests.push({ page, at: yield* Clock.currentTimeMillis });
            if (page === 100 && !limited) {
              limited = true;
              return yield* new ClickUpError({ message: "Rate limited", retryAfterMs: 45_000 });
            }
            return { tasks: [task(String(page))], last_page: page === 100 };
          }),
      });
      const pending = yield* Effect.forkChild(
        search("42", "token", "100").pipe(
          Effect.tap(() =>
            Effect.sync(() => {
              completed = true;
            }),
          ),
        ),
      );
      yield* TestClock.adjust("100 seconds");
      assert.equal(requests.length, 101);
      assert.isFalse(completed);
      assert.deepEqual(
        requests.map(({ at }) => at),
        Array.from({ length: 101 }, (_, i) => i * 1_000),
      );
      yield* TestClock.adjust("44 seconds");
      assert.equal(requests.length, 101);
      yield* TestClock.adjust("1 second");
      const result = yield* Fiber.join(pending);
      assert.deepEqual(
        result.tasks.map(({ taskId }) => taskId),
        ["100"],
      );
      assert.deepEqual(requests.at(-1), { page: 100, at: 145_000 });
      yield* search("42", "token", "0");
      assert.equal(requests.length, 102);
    }),
);

it.effect("retains successful pages after cancellation and expires completed snapshots", () =>
  Effect.gen(function* () {
    const pages: number[] = [];
    const search = yield* makeTaskSearch({
      request: (path) =>
        Effect.sync(() => {
          const page = Number(new URL(path, "https://fixture.test").searchParams.get("page"));
          pages.push(page);
          return { tasks: [task(String(page))], last_page: page === 2 };
        }),
    });
    const cancelled = yield* Effect.forkChild(search("42", "token", "Task"));
    yield* TestClock.adjust("1 second");
    assert.deepEqual(pages, [0, 1]);
    yield* Fiber.interrupt(cancelled);
    const resumed = yield* Effect.forkChild(search("42", "token", "Task"));
    yield* TestClock.adjust("1 second");
    assert.equal((yield* Fiber.join(resumed)).tasks.length, 3);
    assert.deepEqual(pages, [0, 1, 2]);
    yield* TestClock.adjust("5 minutes");
    const refreshed = yield* Effect.forkChild(search("42", "token", "Task"));
    yield* TestClock.adjust("2 seconds");
    assert.equal((yield* Fiber.join(refreshed)).tasks.length, 3);
    assert.deepEqual(pages, [0, 1, 2, 0, 1, 2]);
  }),
);

it.effect("shares pacing across workspaces while keeping their snapshots account-scoped", () =>
  Effect.gen(function* () {
    const requests: Array<{ token: string | undefined; at: number }> = [];
    const search = yield* makeTaskSearch({
      request: (_path, options) =>
        Effect.gen(function* () {
          requests.push({ token: options?.token, at: yield* Clock.currentTimeMillis });
          return { tasks: [task(options?.token ?? "")], last_page: true };
        }),
    });
    const pending = yield* Effect.forkChild(
      Effect.all(
        [search("42", "one", "Task"), search("other", "one", "Task"), search("42", "two", "Task")],
        { concurrency: "unbounded" },
      ),
    );
    yield* TestClock.adjust("2 seconds");
    const results = yield* Fiber.join(pending);
    assert.deepEqual(
      results.map((result) => result.tasks[0]?.taskId),
      ["one", "one", "two"],
    );
    assert.deepEqual(
      requests.map(({ at }) => at),
      [0, 1_000, 2_000],
    );
  }),
);
