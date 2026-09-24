import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { ClickUpApi } from "./ClickUpApi.ts";
import { ClickUpConnection } from "./ClickUpConnection.ts";
import {
  ClickUpSprints,
  layer,
  STUDIO_CLICKUP_SPRINT_FOLDER_ID,
  validateSprintList,
} from "./ClickUpSprints.ts";

function setup() {
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
              workspaces: [
                { id: "2179724", name: "Studio" },
                { id: "other", name: "Other" },
              ],
            },
          }),
        }),
      ),
      Layer.provide(
        Layer.succeed(ClickUpApi, {
          request: (path) =>
            Effect.sync(() => {
              paths.push(path);
              return {
                lists: [
                  {
                    id: "list-1",
                    name: "Current sprint",
                    start_date: "0",
                    due_date: "9999999999999",
                    task_count: "12",
                    folder: { id: STUDIO_CLICKUP_SPRINT_FOLDER_ID, name: "Sprints" },
                  },
                ],
              };
            }),
        }),
      ),
    ),
  };
}

it.effect("reads only the company sprint folder and normalizes list metadata", () => {
  const test = setup();
  return Effect.gen(function* () {
    const service = yield* ClickUpSprints;
    const result = yield* service.list({ workspaceId: "2179724", userId: 17 });
    assert.equal(result.activeSprintId, "list-1");
    assert.equal(result.sprints[0]?.taskCount, 12);
    assert.equal(result.folderName, "Sprints");
    assert.deepEqual(test.paths, [`folder/${STUDIO_CLICKUP_SPRINT_FOLDER_ID}/list?archived=false`]);
  }).pipe(Effect.provide(test.layer));
});

it.effect(
  "rejects stale identity, unauthorized workspace, and unsupported company sources before fetching",
  () => {
    const test = setup();
    return Effect.gen(function* () {
      const service = yield* ClickUpSprints;
      for (const input of [
        { workspaceId: "2179724", userId: 18 },
        { workspaceId: "forbidden", userId: 17 },
        { workspaceId: "other", userId: 17 },
      ]) {
        assert.equal((yield* Effect.result(service.list(input)))._tag, "Failure");
      }
      assert.deepEqual(test.paths, []);
    }).pipe(Effect.provide(test.layer));
  },
);

it.effect("validates selected list membership before allowing its tasks to be read", () =>
  Effect.gen(function* () {
    const paths: string[] = [];
    const api = ClickUpApi.of({
      request: (path) =>
        Effect.sync(() => {
          paths.push(path);
          return {
            folder: {
              id: path.endsWith("correct") ? STUDIO_CLICKUP_SPRINT_FOLDER_ID : "other-folder",
            },
          };
        }),
    });
    yield* validateSprintList(api, "fixture-token", "2179724", "correct");
    assert.equal(
      (yield* Effect.result(validateSprintList(api, "fixture-token", "2179724", "wrong")))._tag,
      "Failure",
    );
    assert.equal(
      (yield* Effect.result(validateSprintList(api, "fixture-token", "other-workspace", "correct")))
        ._tag,
      "Failure",
    );
    assert.deepEqual(paths, ["list/correct", "list/wrong"]);
  }),
);
