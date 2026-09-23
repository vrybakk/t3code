import { assert, it } from "@effect/vitest";
import { Deferred, Effect, Fiber } from "effect";
import { withProviderHistoryAdmission, withProviderHistoryCleanup } from "./historyAdmission.ts";

it.effect("does not admit a session until cleanup has finished", () =>
  Effect.gen(function* () {
    const entered = yield* Deferred.make<void>();
    const release = yield* Deferred.make<void>();
    const events: string[] = [];
    const cleanup = yield* withProviderHistoryCleanup(
      Effect.gen(function* () {
        events.push("cleanup started");
        yield* Deferred.succeed(entered, undefined);
        yield* Deferred.await(release);
        events.push("cleanup finished");
      }),
    ).pipe(Effect.forkChild);
    yield* Deferred.await(entered);
    const session = yield* withProviderHistoryAdmission(
      Effect.sync(() => events.push("session admitted")),
    ).pipe(Effect.forkChild);
    yield* Deferred.succeed(release, undefined);
    yield* Fiber.join(cleanup);
    yield* Fiber.join(session);
    assert.deepEqual(events, ["cleanup started", "cleanup finished", "session admitted"]);
  }),
);

it.effect(
  "does not admit session startup after interruption until cleanup's asynchronous mutation settles",
  () =>
    Effect.gen(function* () {
      const entered = yield* Deferred.make<void>();
      const release = Promise.withResolvers<void>();
      const startupEntered = yield* Deferred.make<void>();
      const cleanup = yield* withProviderHistoryCleanup(
        Effect.gen(function* () {
          yield* Deferred.succeed(entered, undefined);
          yield* Effect.promise(() => release.promise);
        }).pipe(Effect.uninterruptible),
      ).pipe(Effect.forkChild);
      yield* Deferred.await(entered);
      const interrupt = yield* Fiber.interrupt(cleanup).pipe(Effect.forkChild);
      const startup = yield* withProviderHistoryAdmission(
        Deferred.succeed(startupEntered, undefined),
      ).pipe(Effect.forkChild);
      yield* Effect.yieldNow;
      assert.isFalse(yield* Deferred.isDone(startupEntered));
      yield* Effect.sync(() => release.resolve());
      yield* Fiber.join(interrupt);
      yield* Fiber.join(startup);
      assert.isTrue(yield* Deferred.isDone(startupEntered));
    }),
);

it.effect("releases admission after a failed operation", () =>
  Effect.gen(function* () {
    yield* withProviderHistoryCleanup(Effect.fail("failed cleanup")).pipe(Effect.flip);
    assert.equal(yield* withProviderHistoryAdmission(Effect.succeed("admitted")), "admitted");
  }),
);

it.effect("allows concurrent session starts and waits for both before cleanup", () =>
  Effect.gen(function* () {
    const firstEntered = yield* Deferred.make<void>();
    const secondEntered = yield* Deferred.make<void>();
    const release = yield* Deferred.make<void>();
    const events: string[] = [];
    const start = (entered: Deferred.Deferred<void>, name: string) =>
      withProviderHistoryAdmission(
        Effect.gen(function* () {
          yield* Deferred.succeed(entered, undefined);
          yield* Deferred.await(release);
          events.push(name);
        }),
      ).pipe(Effect.forkChild);
    const first = yield* start(firstEntered, "first started");
    const second = yield* start(secondEntered, "second started");
    yield* Deferred.await(firstEntered);
    yield* Deferred.await(secondEntered);
    const cleanup = yield* withProviderHistoryCleanup(
      Effect.sync(() => events.push("cleanup admitted")),
    ).pipe(Effect.forkChild);
    yield* Deferred.succeed(release, undefined);
    yield* Fiber.join(first);
    yield* Fiber.join(second);
    yield* Fiber.join(cleanup);
    assert.sameMembers(events.slice(0, 2), ["first started", "second started"]);
    assert.equal(events[2], "cleanup admitted");
  }),
);
