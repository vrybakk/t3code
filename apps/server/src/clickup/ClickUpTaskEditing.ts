import {
  ClickUpError,
  type ClickUpTaskInput,
  type ClickUpTaskOptions,
  type ClickUpSetStatusInput,
  type ClickUpSetTagInput,
  type ClickUpCompleteEstimationInput,
  type ClickUpCompleteEstimationResult,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import * as Semaphore from "effect/Semaphore";
import { ApiTask, ClickUpApi, decodeResponse, nullableNumber } from "./ClickUpApi.ts";
import { ClickUpConnection } from "./ClickUpConnection.ts";

const OptionalText = Schema.optional(Schema.NullOr(Schema.String));
const EditingTask = Schema.Struct({
  ...ApiTask.fields,
  list: Schema.Struct({ id: Schema.String, name: Schema.String }),
  space: Schema.Struct({ id: Schema.String }),
  time_estimate: Schema.optional(Schema.NullOr(Schema.Union([Schema.Number, Schema.String]))),
});
const ListStatuses = Schema.Struct({
  statuses: Schema.Array(
    Schema.Struct({
      status: Schema.String,
      color: OptionalText,
      type: OptionalText,
    }),
  ),
});
const SpaceTags = Schema.Struct({
  tags: Schema.Array(
    Schema.Struct({
      name: Schema.String,
      tag_bg: OptionalText,
    }),
  ),
});

export class ClickUpTaskEditing extends Context.Service<
  ClickUpTaskEditing,
  {
    readonly options: (input: ClickUpTaskInput) => Effect.Effect<ClickUpTaskOptions, ClickUpError>;
    readonly setStatus: (input: ClickUpSetStatusInput) => Effect.Effect<void, ClickUpError>;
    readonly setTag: (input: ClickUpSetTagInput) => Effect.Effect<void, ClickUpError>;
    readonly completeEstimation: (
      input: ClickUpCompleteEstimationInput,
    ) => Effect.Effect<ClickUpCompleteEstimationResult, ClickUpError>;
  }
>()("t3/clickup/ClickUpTaskEditing") {}

export const layer = Layer.effect(
  ClickUpTaskEditing,
  Effect.gen(function* () {
    const api = yield* ClickUpApi;
    const connection = yield* ClickUpConnection;
    const estimationGate = yield* Semaphore.make(1);
    const readTask = (input: ClickUpTaskInput, token: string) =>
      api.request(`task/${encodeURIComponent(input.taskId)}`, { token }).pipe(
        Effect.flatMap(decodeResponse(EditingTask)),
        Effect.flatMap((task) =>
          task.id === input.taskId && task.team_id === input.workspaceId
            ? Effect.succeed(task)
            : Effect.fail(
                new ClickUpError({
                  message: "This task does not belong to the selected ClickUp workspace.",
                }),
              ),
        ),
      );
    const authorizedTask = Effect.fn("ClickUpTaskEditing.authorizedTask")(function* (
      input: ClickUpTaskInput,
    ) {
      const { token, connection: account } = yield* connection.account;
      if (
        account.user?.id !== input.userId ||
        !account.workspaces.some((workspace) => workspace.id === input.workspaceId)
      ) {
        return yield* new ClickUpError({
          message: "The ClickUp account or workspace changed. Refresh the connection.",
        });
      }
      return { token, task: yield* readTask(input, token) };
    });
    const statuses = (listId: string, token: string) =>
      api
        .request(`list/${encodeURIComponent(listId)}`, { token })
        .pipe(Effect.flatMap(decodeResponse(ListStatuses)));
    const tags = (spaceId: string, token: string) =>
      api
        .request(`space/${encodeURIComponent(spaceId)}/tag`, { token })
        .pipe(Effect.flatMap(decodeResponse(SpaceTags)));
    const options = Effect.fn("ClickUpTaskEditing.options")(function* (input: ClickUpTaskInput) {
      const { token, task } = yield* authorizedTask(input);
      const choices = yield* Effect.all(
        { statuses: statuses(task.list.id, token), tags: tags(task.space.id, token) },
        { concurrency: 2 },
      );
      return {
        statuses: choices.statuses.statuses.map((status) => ({
          name: status.status,
          color: status.color ?? null,
          type: status.type ?? null,
        })),
        tags: choices.tags.tags.map((tag) => ({ name: tag.name, color: tag.tag_bg ?? null })),
        currentTags: (task.tags ?? []).map((tag) => tag.name),
        status: task.status.status,
      };
    });
    const setStatus = Effect.fn("ClickUpTaskEditing.setStatus")(function* (
      input: ClickUpSetStatusInput,
    ) {
      const { token, task } = yield* authorizedTask(input);
      const available = yield* statuses(task.list.id, token);
      if (!available.statuses.some((status) => status.status === input.status)) {
        return yield* new ClickUpError({
          message:
            "This status is not available in the task's home list. Refresh the task options.",
        });
      }
      yield* api.request(`task/${encodeURIComponent(input.taskId)}`, {
        token,
        method: "PUT",
        body: { status: input.status },
      });
    });
    const setTag = Effect.fn("ClickUpTaskEditing.setTag")(function* (input: ClickUpSetTagInput) {
      const { token, task } = yield* authorizedTask(input);
      const alreadyPresent = task.tags?.some((tag) => tag.name === input.tag) ?? false;
      if (alreadyPresent === input.present) return;
      if (input.present) {
        const available = yield* tags(task.space.id, token);
        if (!available.tags.some((tag) => tag.name === input.tag)) {
          return yield* new ClickUpError({
            message: "This tag is not available in the task's space. Refresh the task options.",
          });
        }
      }
      yield* api.request(
        `task/${encodeURIComponent(input.taskId)}/tag/${encodeURIComponent(input.tag)}`,
        { token, method: input.present ? "POST" : "DELETE" },
      );
    });
    const completeEstimation = Effect.fn("ClickUpTaskEditing.completeEstimation")(function* (
      input: ClickUpCompleteEstimationInput,
    ) {
      const { token, task } = yield* authorizedTask(input);
      const marker = task.tags?.find(
        (tag) => tag.name.trim().toLowerCase() === "estimation needed",
      );
      if (!marker) {
        return yield* new ClickUpError({
          message:
            "This task no longer has the estimation needed tag. Refresh the task before estimating.",
        });
      }
      const estimateMs = input.estimateMinutes * 60_000;
      if (nullableNumber(task.time_estimate) !== estimateMs) {
        yield* api.request(`task/${encodeURIComponent(input.taskId)}`, {
          token,
          method: "PUT",
          body: { time_estimate: estimateMs },
        });
      }
      const saved = yield* readTask(input, token).pipe(
        Effect.mapError(
          () =>
            new ClickUpError({
              message:
                "Could not confirm the saved estimate. The estimation tag was kept; refresh the task before retrying.",
            }),
        ),
      );
      if (nullableNumber(saved.time_estimate) !== estimateMs) {
        return yield* new ClickUpError({
          message:
            "ClickUp did not confirm the requested estimate. The estimation tag was kept; refresh the task before retrying.",
        });
      }
      const tagRemoved = yield* api
        .request(
          `task/${encodeURIComponent(input.taskId)}/tag/${encodeURIComponent(marker.name)}`,
          { token, method: "DELETE" },
        )
        .pipe(
          Effect.as(true),
          Effect.catchTag("ClickUpError", () => Effect.succeed(false)),
        );
      return { estimateMinutes: input.estimateMinutes, tagRemoved };
    });
    return ClickUpTaskEditing.of({
      options,
      setStatus,
      setTag,
      completeEstimation: (input) => completeEstimation(input).pipe(estimationGate.withPermit),
    });
  }),
);
