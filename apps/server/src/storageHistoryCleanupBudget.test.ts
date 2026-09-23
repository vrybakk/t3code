// @effect-diagnostics nodeBuiltinImport:off -- Mutations are limited to dedicated temporary test histories.
import * as NodeFSP from "node:fs/promises";
import { assert, it } from "@effect/vitest";
import { Deferred, Effect, Fiber } from "effect";
import {
  withProviderHistoryAdmission,
  withProviderHistoryCleanup,
} from "./provider/historyAdmission.ts";
import { cleanupFixture } from "./testFixtures/storageHistoryCleanup.ts";

for (const fails of [false, true]) {
  it.effect(
    `stops a slow ${fails ? "failed" : "successful"} batch without releasing an active mutation`,
    () =>
      Effect.gen(function* () {
        const entered = Promise.withResolvers<void>();
        const release = Promise.withResolvers<void>();
        const startupEntered = yield* Deferred.make<void>();
        const fixture = yield* Effect.promise(() =>
          cleanupFixture({
            family: true,
            parent: "parent",
            trash: async (path) => {
              entered.resolve();
              await release.promise;
              if (fails) throw new Error("Trash timed out");
              await NodeFSP.unlink(path);
            },
          }),
        );
        const review = yield* Effect.promise(() =>
          fixture.cleanup.review({
            ...fixture.reviewInput,
            historyIds: [],
            groupIds: [fixture.snapshot!.groups![0]!.id],
          }),
        );
        assert.equal(review.eligibleCount, 3);
        const input = fixture.executeInput(review.planId);
        const cleanup = yield* withProviderHistoryCleanup(
          Effect.promise(() => fixture.cleanup.execute(input)).pipe(Effect.uninterruptible),
        ).pipe(Effect.forkChild);
        yield* Effect.promise(() => entered.promise);
        fixture.advance(30_000);
        const startup = yield* withProviderHistoryAdmission(
          Deferred.succeed(startupEntered, undefined),
        ).pipe(Effect.forkChild);
        yield* Effect.yieldNow;
        const admittedDuringMutation = yield* Deferred.isDone(startupEntered);
        release.resolve();
        const result = yield* Fiber.join(cleanup);
        yield* Fiber.join(startup);

        assert.isFalse(admittedDuringMutation);
        assert.isTrue(yield* Deferred.isDone(startupEntered));
        assert.equal(fixture.trashCalls(), 1);
        assert.equal(result.items[0]!.status, fails ? "failed" : "trashed");
        assert.equal(result.processedTotals.fileCount, fails ? 0 : 1);
        assert.equal(
          result.processedTotals.logicalBytes,
          fails ? 0 : review.items[0]!.logicalBytes,
        );
        assert.equal(
          result.processedTotals.allocatedBytes,
          fails ? 0 : review.items[0]!.allocatedBytes,
        );
        for (const item of result.items.slice(1)) {
          assert.equal(item.status, "blocked");
          assert.include(item.reason!, "time limit reached");
          assert.isTrue((yield* Effect.promise(() => NodeFSP.stat(item.filePath))).isFile());
        }
        if (fails)
          assert.isTrue(
            (yield* Effect.promise(() => NodeFSP.stat(result.items[0]!.filePath))).isFile(),
          );
        assert.deepEqual(yield* Effect.promise(() => fixture.cleanup.execute(input)), result);
        assert.equal(fixture.trashCalls(), 1);
      }),
  );
}
