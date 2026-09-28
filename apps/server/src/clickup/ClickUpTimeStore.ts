import * as NodeCrypto from "node:crypto";
import {
  ClickUpError,
  type ClickUpTimePreviewInput,
  type ThreadId,
  type ClickUpTaskReference,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

interface Source {
  id: string;
  kind: "manual" | "agent-turn";
  threadId: ThreadId;
  threadTitle: string;
  occurredAt: string;
  startedAt: string | null;
  duration: number;
  revision: number;
}
export interface TimeReceipt {
  rootId: string;
  fingerprint: string;
  userId: number;
  workspaceId: string;
  taskId: string;
  name: string;
  state: "sending" | "posted";
  remoteId: string | null;
}
const failure = () => new ClickUpError({ message: "Could not read or save ClickUp time records." });

export const makeTimeStore = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const receipt = (rootId: string) =>
    sql<TimeReceipt>`SELECT root_record_id AS "rootId", fingerprint,
    user_id AS "userId", workspace_id AS "workspaceId", task_id AS "taskId", task_name AS name,
    state, remote_id AS "remoteId" FROM clickup_time_exports WHERE root_record_id = ${rootId}`.pipe(
      Effect.map((rows) => rows[0]),
      Effect.mapError(failure),
    );
  const read = Effect.fn("ClickUpTimeStore.read")(function* (id: string) {
    const rows =
      yield* sql<Source>`SELECT r.id, r.kind, r.thread_id AS "threadId", t.title AS "threadTitle",
      r.occurred_at AS "occurredAt", p.started_at AS "startedAt", r.revision,
      CASE WHEN r.kind = 'manual' THEN r.duration_ms ELSE r.elapsed_ms END AS duration
      FROM work_records r JOIN projection_threads t ON t.thread_id = r.thread_id
      LEFT JOIN projection_turns p ON p.thread_id = r.thread_id AND p.turn_id = r.turn_id
      WHERE r.id = ${id} AND r.supersedes_id IS NULL AND t.deleted_at IS NULL
        AND r.kind IN ('manual', 'agent-turn')`.pipe(Effect.mapError(failure));
    const source = rows[0];
    if (!source || !(source.duration > 0))
      return yield* new ClickUpError({
        message: "This time record is no longer available. Refresh the list.",
      });
    const roots = yield* sql<{
      id: string;
      occurredAt: string;
      duration: number | null;
    }>`WITH RECURSIVE lineage(id, revision, occurred_at, duration_ms) AS (
      SELECT id, revision, occurred_at, duration_ms FROM work_records WHERE id = ${id}
      UNION ALL SELECT r.id, r.revision, r.occurred_at, r.duration_ms FROM work_records r JOIN lineage l ON r.supersedes_id = l.id
    ) SELECT id, occurred_at AS "occurredAt", duration_ms AS duration FROM lineage ORDER BY revision`.pipe(
      Effect.mapError(failure),
    );
    const rootId = roots[0]!.id;
    const start =
      source.kind === "manual"
        ? Date.parse(source.occurredAt)
        : source.startedAt
          ? Date.parse(source.startedAt)
          : Date.parse(source.occurredAt) - source.duration;
    const fingerprint = NodeCrypto.createHash("sha256")
      .update(
        [source.id, source.revision, source.threadId, source.kind, start, source.duration].join(
          "\0",
        ),
      )
      .digest("hex");
    const tasks =
      yield* sql<ClickUpTaskReference>`SELECT workspace_id AS "workspaceId", task_id AS "taskId", name
      FROM projection_thread_clickup_tasks WHERE thread_id = ${source.threadId} ORDER BY is_primary DESC, task_id`.pipe(
        Effect.mapError(failure),
      );
    const recoveryStart =
      source.kind === "manual"
        ? Math.min(start, ...roots.map((r) => Date.parse(r.occurredAt)))
        : start;
    const recoveryEnd =
      source.kind === "manual"
        ? Math.max(
            start + source.duration,
            ...roots.map((r) => Date.parse(r.occurredAt) + (r.duration ?? 0)),
          )
        : start + source.duration;
    return {
      source,
      rootId,
      start,
      recoveryStart,
      recoveryEnd,
      fingerprint,
      tasks,
      receipt: yield* receipt(rootId),
    };
  });
  const list = Effect.fn("ClickUpTimeStore.list")(function* (input: ClickUpTimePreviewInput) {
    const scope = input.threadId ? sql`AND r.thread_id = ${input.threadId}` : sql``;
    const eligible = sql`r.supersedes_id IS NULL AND r.kind IN ('manual', 'agent-turn')
      AND CASE WHEN r.kind = 'manual' THEN r.duration_ms ELSE r.elapsed_ms END > 0`;
    const linked = sql`EXISTS (SELECT 1 FROM projection_thread_clickup_tasks c WHERE c.thread_id = r.thread_id)`;
    const rows = yield* sql<{ id: string }>`SELECT r.id FROM work_records r
      JOIN projection_threads t ON t.thread_id = r.thread_id
      WHERE ${eligible} AND t.deleted_at IS NULL AND ${linked} ${scope}
      ORDER BY r.occurred_at DESC, r.id LIMIT 51 OFFSET ${input.offset}`.pipe(
      Effect.mapError(failure),
    );
    const counts = yield* sql<{ count: number }>`SELECT COUNT(*) AS count FROM work_records r
      WHERE ${eligible} AND NOT ${linked} ${scope}`.pipe(Effect.mapError(failure));
    return {
      rows: yield* Effect.forEach(rows.slice(0, 50), (row) => read(row.id)),
      hasMore: rows.length > 50,
      unlinkedCount: counts[0]!.count,
    };
  });
  const reserve = (value: TimeReceipt) =>
    sql`INSERT INTO clickup_time_exports
    (root_record_id, fingerprint, user_id, workspace_id, task_id, task_name, state, remote_id)
    VALUES (${value.rootId}, ${value.fingerprint}, ${value.userId}, ${value.workspaceId}, ${value.taskId}, ${value.name}, 'sending', NULL)`.pipe(
      Effect.asVoid,
      Effect.mapError(failure),
    );
  const confirm = (rootId: string, remoteId: string) =>
    sql`UPDATE clickup_time_exports SET state = 'posted', remote_id = ${remoteId}
    WHERE root_record_id = ${rootId}`.pipe(Effect.asVoid, Effect.mapError(failure));
  return { read, list, reserve, confirm };
});
