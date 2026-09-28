import {
  ClickUpError,
  type ClickUpTimePreviewInput,
  type ClickUpTimeRecord,
  type ClickUpTimeSelection,
  type ClickUpTimeSyncInput,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import * as Semaphore from "effect/Semaphore";
import { ClickUpApi, decodeResponse } from "./ClickUpApi.ts";
import { ClickUpConnection } from "./ClickUpConnection.ts";
import { ClickUpTasks } from "./ClickUpTasks.ts";
import { makeTimeStore } from "./ClickUpTimeStore.ts";

const ApiTime = Schema.Struct({
  id: Schema.String,
  start: Schema.Union([Schema.String, Schema.Number]),
  duration: Schema.Union([Schema.String, Schema.Number]),
  description: Schema.optional(Schema.String),
  user: Schema.Struct({ id: Schema.Int }),
  task: Schema.optional(Schema.NullOr(Schema.Struct({ id: Schema.String }))),
});
interface SyncResult {
  recordId: string;
  synced: boolean;
  message: string;
}
export class ClickUpTimeSync extends Context.Service<
  ClickUpTimeSync,
  {
    readonly preview: (input: ClickUpTimePreviewInput) => Effect.Effect<
      {
        records: ReadonlyArray<ClickUpTimeRecord>;
        hasMore: boolean;
        unlinkedCount: number;
      },
      ClickUpError
    >;
    readonly sync: (
      input: ClickUpTimeSyncInput,
    ) => Effect.Effect<{ results: ReadonlyArray<SyncResult> }, ClickUpError>;
  }
>()("t3/clickup/ClickUpTimeSync") {}

export const layer = Layer.effect(
  ClickUpTimeSync,
  Effect.gen(function* () {
    const api = yield* ClickUpApi;
    const connection = yield* ClickUpConnection;
    const tasks = yield* ClickUpTasks;
    const store = yield* makeTimeStore;
    const gate = yield* Semaphore.make(1);
    const account = Effect.fn("ClickUpTimeSync.account")(function* (userId: number) {
      const value = yield* connection.account;
      if (value.connection.user?.id !== userId)
        return yield* new ClickUpError({
          message: "The ClickUp account changed. Reopen time sync.",
        });
      return value;
    });
    const preview = Effect.fn("ClickUpTimeSync.preview")(function* (
      input: ClickUpTimePreviewInput,
    ) {
      const current = yield* account(input.userId);
      const data = yield* store.list(input);
      return {
        hasMore: data.hasMore,
        unlinkedCount: data.unlinkedCount,
        records: data.rows.map((row): ClickUpTimeRecord => ({
          recordId: row.source.id,
          fingerprint: row.fingerprint,
          kind: row.source.kind,
          threadId: row.source.threadId,
          threadTitle: row.source.threadTitle,
          start: row.start,
          duration: row.source.duration,
          tasks: row.tasks.filter((task) =>
            current.connection.workspaces.some((w) => w.id === task.workspaceId),
          ),
          state: !row.receipt
            ? "pending"
            : row.receipt.fingerprint !== row.fingerprint || row.receipt.userId !== input.userId
              ? "changed"
              : row.receipt.state === "posted"
                ? "synced"
                : "uncertain",
          destination: row.receipt
            ? {
                workspaceId: row.receipt.workspaceId,
                taskId: row.receipt.taskId,
                name: row.receipt.name,
              }
            : null,
        })),
      };
    });
    const syncOne = Effect.fn("ClickUpTimeSync.syncOne")(function* (
      userId: number,
      selection: ClickUpTimeSelection,
    ) {
      const current = yield* account(userId);
      const row = yield* store.read(selection.recordId);
      if (row.fingerprint !== selection.fingerprint)
        return yield* new ClickUpError({ message: "The record changed. Refresh before syncing." });
      const task = row.tasks.find(
        (t) => t.workspaceId === selection.workspaceId && t.taskId === selection.taskId,
      );
      if (!task || !current.connection.workspaces.some((w) => w.id === task.workspaceId))
        return yield* new ClickUpError({
          message: "Choose a task currently linked to this thread in your ClickUp workspace.",
        });
      const receipt = row.receipt;
      if (
        receipt &&
        (receipt.fingerprint !== row.fingerprint ||
          receipt.userId !== userId ||
          receipt.workspaceId !== task.workspaceId ||
          receipt.taskId !== task.taskId)
      )
        return yield* new ClickUpError({
          message:
            "This record was already allocated or changed after export. Reconcile its existing ClickUp entry manually.",
        });
      if (receipt?.state === "posted") return;
      yield* tasks.authorize({ userId, workspaceId: task.workspaceId, taskId: task.taskId });
      const marker = `[nerd-time:${row.rootId}]`;
      const description = `${row.source.kind === "manual" ? "Nerd manual work" : "Nerd agent runtime (includes waiting)"} ${marker}`;
      const path = `team/${encodeURIComponent(task.workspaceId)}/time_entries`;
      const query = new URLSearchParams({
        start_date: String(row.recoveryStart - 1),
        end_date: String(row.recoveryEnd + 1),
      });
      const remote = yield* api
        .request(`${path}?${query}`, { token: current.token })
        .pipe(Effect.flatMap(decodeResponse(Schema.Struct({ data: Schema.Array(ApiTime) }))));
      const marked = remote.data.filter((entry) => entry.description?.includes(marker));
      const matches = (entry: typeof ApiTime.Type) =>
        entry.user.id === userId &&
        entry.task?.id === task.taskId &&
        Number(entry.start) === row.start &&
        Number(entry.duration) === row.source.duration;
      if (marked.length > 1 || (marked.length === 1 && !matches(marked[0]!)))
        return yield* new ClickUpError({
          message:
            "The existing ClickUp entry differs. Review it in ClickUp before making changes.",
        });
      if (!marked.length && receipt)
        return yield* new ClickUpError({
          message:
            "Delivery is still unconfirmed. Check ClickUp; this record will not be sent twice.",
        });
      if (!marked.length && remote.data.some((entry) => matches(entry)))
        return yield* new ClickUpError({
          message:
            "ClickUp already has an entry with this task, start and duration. Review it before adding time.",
        });
      const latest = yield* store.read(selection.recordId);
      if (
        latest.fingerprint !== row.fingerprint ||
        !latest.tasks.some((t) => t.workspaceId === task.workspaceId && t.taskId === task.taskId)
      )
        return yield* new ClickUpError({
          message: "The record or linked tasks changed. Refresh before syncing.",
        });
      if ((yield* account(userId)).token !== current.token)
        return yield* new ClickUpError({
          message: "The ClickUp connection changed. Reopen time sync.",
        });
      // Reserving before POST prevents lost responses and concurrent retries from duplicating time.
      if (!receipt)
        yield* store.reserve({
          rootId: row.rootId,
          fingerprint: row.fingerprint,
          userId,
          ...task,
          state: "sending",
          remoteId: null,
        });
      if (marked[0]) {
        yield* store.confirm(row.rootId, marked[0].id);
        return;
      }
      const created = yield* api
        .request(path, {
          token: current.token,
          method: "POST",
          body: {
            tid: task.taskId,
            start: row.start,
            duration: row.source.duration,
            description,
            billable: false,
            assignee: userId,
          },
        })
        .pipe(
          Effect.flatMap(decodeResponse(Schema.Struct({ data: ApiTime }))),
          Effect.mapError(
            () =>
              new ClickUpError({
                message:
                  "Delivery could not be confirmed. Refresh and check ClickUp; automatic resending is disabled.",
              }),
          ),
        );
      if (!matches(created.data) || !created.data.description?.includes(marker))
        return yield* new ClickUpError({
          message: "ClickUp returned different time details. Review the entry before continuing.",
        });
      yield* store.confirm(row.rootId, created.data.id);
    });
    const sync = Effect.fn("ClickUpTimeSync.sync")(function* (input: ClickUpTimeSyncInput) {
      yield* account(input.userId);
      const results = yield* Effect.forEach(input.records, (selection) =>
        syncOne(input.userId, selection).pipe(
          Effect.map((): SyncResult => ({
            recordId: selection.recordId,
            synced: true,
            message: "Synced",
          })),
          Effect.catch((error) =>
            Effect.succeed<SyncResult>({
              recordId: selection.recordId,
              synced: false,
              message: error.message,
            }),
          ),
        ),
      );
      return { results };
    });
    return ClickUpTimeSync.of({ preview, sync: (input) => sync(input).pipe(gate.withPermit) });
  }),
);
