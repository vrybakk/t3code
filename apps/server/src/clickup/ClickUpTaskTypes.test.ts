import { assert, it } from "@effect/vitest";
import { ClickUpError } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import { nativeTaskType, readTaskTypes } from "./ClickUpTaskTypes.ts";

it("distinguishes native types, workspace types and unknown custom IDs", () => {
  for (const id of [undefined, null, 0])
    assert.deepEqual(nativeTaskType(id), { id: 0, name: "Task" });
  assert.deepEqual(nativeTaskType(1), { id: 1, name: "Milestone" });
  const catalog = new Map([
    [73, "Bug"],
    [94, "User Story"],
  ]);
  assert.deepEqual(nativeTaskType(73, catalog), { id: 73, name: "Bug" });
  assert.deepEqual(nativeTaskType(94, catalog), { id: 94, name: "User Story" });
  assert.deepEqual(nativeTaskType(500, catalog), { id: 500, name: "Unknown type" });
});

it.effect("uses the captured workspace credential and leaves unknown IDs on catalog failure", () =>
  Effect.gen(function* () {
    const calls: string[] = [];
    const catalog = yield* readTaskTypes(
      {
        request: (path, options) => {
          calls.push(path);
          assert.equal(options?.token, "fixture-token");
          return Effect.fail(new ClickUpError({ message: "Rate limited" }));
        },
      },
      "fixture-token",
      "42",
    );
    assert.deepEqual(calls, ["team/42/custom_item"]);
    assert.deepEqual(nativeTaskType(73, catalog), { id: 73, name: "Unknown type" });
  }),
);
