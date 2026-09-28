import { CommandId, type OrchestrationThreadShell } from "@t3tools/contracts";
import * as Crypto from "effect/Crypto";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Result from "effect/Result";
import * as Schedule from "effect/Schedule";
import * as Schema from "effect/Schema";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import { OrchestrationEngineService } from "../orchestration/Services/OrchestrationEngine.ts";
import { ProjectionSnapshotQuery } from "../orchestration/Services/ProjectionSnapshotQuery.ts";
import { threadHasQueuedTurnStart } from "../orchestration/ThreadSettlementPolicy.ts";
import { forkParked } from "../serverActivation.ts";
import { ClickUpApi, decodeResponse } from "./ClickUpApi.ts";
import { ClickUpConnection } from "./ClickUpConnection.ts";

const TaskCompletion = Schema.Struct({
  id: Schema.String,
  team_id: Schema.String,
  status: Schema.Struct({ type: Schema.String }),
  date_closed: Schema.NullOr(Schema.String),
});

function isCandidate(thread: OrchestrationThreadShell, now: string): boolean {
  return (
    thread.archivedAt === null &&
    thread.clickUpTasks?.length === 1 &&
    thread.session?.status !== "starting" &&
    thread.session?.status !== "running" &&
    !thread.hasPendingApprovals &&
    !thread.hasPendingUserInput &&
    thread.backgroundLiveness == null &&
    !threadHasQueuedTurnStart(thread, now)
  );
}

export const make = Effect.gen(function* () {
  const api = yield* ClickUpApi;
  const connection = yield* ClickUpConnection;
  const snapshots = yield* ProjectionSnapshotQuery;
  const engine = yield* OrchestrationEngineService;
  const sql = yield* SqlClient.SqlClient;
  const crypto = yield* Crypto.Crypto;

  return Effect.fn("ClickUpTaskArchiver.sweep")(function* () {
    const snapshot = yield* snapshots.getShellSnapshot();
    const now = DateTime.formatIso(yield* DateTime.now);
    const candidates = snapshot.threads.filter((thread) => isCandidate(thread, now));
    if (candidates.length === 0 || !(yield* connection.status).user) return;
    const account = yield* connection.account;
    const groups = Map.groupBy(
      candidates.filter((thread) =>
        account.connection.workspaces.some(
          (workspace) => workspace.id === thread.clickUpTasks![0]!.workspaceId,
        ),
      ),
      (thread) =>
        JSON.stringify([thread.clickUpTasks![0]!.workspaceId, thread.clickUpTasks![0]!.taskId]),
    );
    for (const threads of groups.values()) {
      const link = threads[0]!.clickUpTasks![0]!;
      const result = yield* api
        .request(`task/${encodeURIComponent(link.taskId)}`, {
          token: account.token,
        })
        .pipe(Effect.flatMap(decodeResponse(TaskCompletion)), Effect.result);
      if (Result.isFailure(result)) {
        yield* Effect.logWarning("Completed task lookup failed", {
          taskId: link.taskId,
          error: result.failure,
        });
        continue;
      }
      const task = result.success;
      const closedAt = task.date_closed === null ? NaN : Number(task.date_closed);
      if (
        task.id !== link.taskId ||
        task.team_id !== link.workspaceId ||
        task.status.type !== "closed" ||
        !Number.isFinite(closedAt) ||
        closedAt <= 0
      )
        continue;

      const currentAccount = yield* connection.account;
      if (
        currentAccount.token !== account.token ||
        currentAccount.connection.user?.id !== account.connection.user?.id
      )
        return;
      for (const thread of threads) {
        // Reopening or linking historical work must survive restarts and later refreshes.
        const [reopened] = yield* sql<{ occurredAt: string }>`
          SELECT occurred_at AS "occurredAt" FROM orchestration_events
          WHERE aggregate_kind = 'thread' AND stream_id = ${thread.id}
            AND sequence <= ${snapshot.snapshotSequence}
            AND (event_type = 'thread.unarchived' OR (
              event_type = 'thread.task-linked'
              AND json_extract(payload_json, '$.link.workspaceId') = ${link.workspaceId}
              AND json_extract(payload_json, '$.link.taskId') = ${link.taskId}
            ))
          ORDER BY sequence DESC LIMIT 1
        `;
        const anchor = Math.max(
          Date.parse(thread.createdAt),
          Date.parse(thread.latestUserMessageAt ?? thread.createdAt),
          Date.parse(reopened?.occurredAt ?? thread.createdAt),
        );
        if (!(closedAt > anchor)) continue;
        yield* engine
          .dispatch({
            type: "thread.task.auto-archive",
            commandId: CommandId.make(`task-archive:${yield* crypto.randomUUIDv4}`),
            threadId: thread.id,
            snapshotSequence: snapshot.snapshotSequence,
            workspaceId: link.workspaceId,
            taskId: link.taskId,
          })
          .pipe(
            Effect.catch((error) =>
              Effect.logWarning("Completed task thread archive deferred", {
                threadId: thread.id,
                error,
              }),
            ),
          );
      }
    }
  });
});

export const layer = Layer.effectDiscard(
  Effect.gen(function* () {
    const sweep = yield* make;
    yield* forkParked(
      sweep().pipe(
        Effect.catch((error) =>
          Effect.logWarning("Completed task thread refresh failed", { error }),
        ),
        Effect.repeat(Schedule.spaced("1 minute")),
        Effect.asVoid,
      ),
    );
  }),
);
