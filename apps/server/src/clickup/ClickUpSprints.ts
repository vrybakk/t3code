import {
  ClickUpError,
  type ClickUpSprintsInput,
  type ClickUpSprintWindow,
} from "@t3tools/contracts";
import * as Clock from "effect/Clock";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import { ClickUpApi, decodeResponse } from "./ClickUpApi.ts";
import { ClickUpConnection } from "./ClickUpConnection.ts";
import { selectSprintWindow } from "./sprintWindow.ts";

const STUDIO_CLICKUP_WORKSPACE_ID = "2179724";
export const STUDIO_CLICKUP_SPRINT_FOLDER_ID = "90122725830";

const ApiNumber = Schema.optional(Schema.NullOr(Schema.Union([Schema.String, Schema.Number])));
const ApiSprintList = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  start_date: ApiNumber,
  due_date: ApiNumber,
  task_count: ApiNumber,
  folder: Schema.Struct({ id: Schema.String, name: Schema.String }),
});

export const validateSprintList = Effect.fn("ClickUpSprints.validateSprintList")(function* (
  api: ClickUpApi["Service"],
  token: string,
  workspaceId: string,
  listId: string,
) {
  if (workspaceId !== STUDIO_CLICKUP_WORKSPACE_ID) {
    return yield* new ClickUpError({ message: "Select a sprint from the Nerd studio workspace." });
  }
  const sprint = yield* api
    .request(`list/${encodeURIComponent(listId)}`, { token })
    .pipe(
      Effect.flatMap(
        decodeResponse(Schema.Struct({ folder: Schema.Struct({ id: Schema.String }) })),
      ),
    );
  if (sprint.folder.id !== STUDIO_CLICKUP_SPRINT_FOLDER_ID) {
    return yield* new ClickUpError({ message: "This list is not in the company Sprints folder." });
  }
});

export class ClickUpSprints extends Context.Service<
  ClickUpSprints,
  {
    readonly list: (input: ClickUpSprintsInput) => Effect.Effect<ClickUpSprintWindow, ClickUpError>;
  }
>()("t3/clickup/ClickUpSprints") {}

export const layer = Layer.effect(
  ClickUpSprints,
  Effect.gen(function* () {
    const api = yield* ClickUpApi;
    const connection = yield* ClickUpConnection;
    const list = Effect.fn("ClickUpSprints.list")(function* (input: ClickUpSprintsInput) {
      const { token, connection: account } = yield* connection.account;
      if (
        account.user?.id !== input.userId ||
        !account.workspaces.some((workspace) => workspace.id === input.workspaceId)
      ) {
        return yield* new ClickUpError({
          message: "Select a workspace authorized by your ClickUp account.",
        });
      }
      if (input.workspaceId !== STUDIO_CLICKUP_WORKSPACE_ID) {
        return yield* new ClickUpError({
          message: "Company sprints are available in the Nerd studio workspace.",
        });
      }
      const { lists } = yield* api
        .request(`folder/${STUDIO_CLICKUP_SPRINT_FOLDER_ID}/list?archived=false`, { token })
        .pipe(
          Effect.flatMap(decodeResponse(Schema.Struct({ lists: Schema.Array(ApiSprintList) }))),
        );
      const matching = lists.filter(
        (sprint) => sprint.folder.id === STUDIO_CLICKUP_SPRINT_FOLDER_ID,
      );
      const now = yield* Clock.currentTimeMillis;
      return {
        folderId: STUDIO_CLICKUP_SPRINT_FOLDER_ID,
        folderName: matching[0]?.folder.name ?? "Sprints",
        ...selectSprintWindow(
          matching.map((sprint) => ({
            id: sprint.id,
            name: sprint.name,
            startDate: sprint.start_date == null ? null : String(sprint.start_date),
            dueDate: sprint.due_date == null ? null : String(sprint.due_date),
            taskCount:
              sprint.task_count == null || !Number.isFinite(Number(sprint.task_count))
                ? null
                : Number(sprint.task_count),
          })),
          now,
        ),
      };
    });
    return ClickUpSprints.of({ list });
  }),
);
