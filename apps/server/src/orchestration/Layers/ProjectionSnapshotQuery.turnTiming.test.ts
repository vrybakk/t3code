import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import { ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { SqlitePersistenceMemory } from "../../persistence/Layers/Sqlite.ts";
import * as RepositoryIdentityResolver from "../../project/RepositoryIdentityResolver.ts";
import { ProjectionSnapshotQuery } from "../Services/ProjectionSnapshotQuery.ts";
import * as ThreadBackgroundLiveness from "../ThreadBackgroundLiveness.ts";
import * as ThreadPlanProgress from "../ThreadPlanProgress.ts";
import { OrchestrationProjectionSnapshotQueryLive } from "./ProjectionSnapshotQuery.ts";

const testLayer = OrchestrationProjectionSnapshotQueryLive.pipe(
  Layer.provide(ThreadBackgroundLiveness.layer),
  Layer.provide(ThreadPlanProgress.layer),
  Layer.provideMerge(RepositoryIdentityResolver.layer),
  Layer.provideMerge(SqlitePersistenceMemory),
  Layer.provideMerge(NodeServices.layer),
);

for (const state of ["running", "completed", "interrupted", "error"] as const) {
  it.effect(`separates ${state} turn timing from checkpoint timing across snapshot reads`, () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const query = yield* ProjectionSnapshotQuery;
      const threadId = ThreadId.make("timing-thread");
      const startedAt = "2026-09-24T10:00:00.000Z";
      const checkpointAt = "2026-09-24T10:05:00.000Z";
      yield* sql`INSERT INTO projection_projects
        (project_id, title, workspace_root, scripts_json, created_at, updated_at)
        VALUES ('timing-project', 'Timing', '/tmp/t3-turn-timing', '[]', ${startedAt}, ${startedAt})`;
      yield* sql`INSERT INTO projection_threads
        (thread_id, project_id, title, model_selection_json, runtime_mode, interaction_mode,
          latest_turn_id, created_at, updated_at)
        VALUES (${threadId}, 'timing-project', 'Checkpoint timing',
          '{"provider":"codex","model":"gpt-5-codex"}', 'full-access', 'default',
          'timing-turn', ${startedAt}, ${checkpointAt})`;
      yield* sql`INSERT INTO projection_thread_sessions
        (thread_id, status, provider_name, active_turn_id, updated_at)
        VALUES (${threadId}, ${state === "running" ? "running" : "ready"}, 'codex',
          ${state === "running" ? "timing-turn" : null}, ${startedAt})`;
      yield* sql`INSERT INTO projection_turns
        (thread_id, turn_id, state, requested_at, started_at, completed_at,
          checkpoint_turn_count, checkpoint_ref, checkpoint_status, checkpoint_files_json)
        VALUES (${threadId}, 'timing-turn', ${state}, ${startedAt}, ${startedAt}, ${checkpointAt},
          1, 'refs/t3/checkpoints/timing/1', 'missing', '[]')`;

      const shell = Option.getOrThrow(yield* query.getThreadShellById(threadId));
      const detail = Option.getOrThrow(yield* query.getThreadDetailById(threadId));
      const commandModel = yield* query.getCommandReadModel();
      const shellSnapshot = yield* query.getShellSnapshot();
      const snapshot = yield* query.getSnapshot();
      for (const thread of [
        shell,
        detail,
        commandModel.threads[0]!,
        shellSnapshot.threads[0]!,
        snapshot.threads[0]!,
      ]) {
        assert.equal(thread.latestTurn?.state, state);
        assert.equal(thread.latestTurn?.startedAt, startedAt);
        assert.equal(thread.latestTurn?.completedAt, state === "running" ? null : checkpointAt);
      }
      assert.equal(detail.checkpoints[0]?.completedAt, checkpointAt);
      assert.equal(snapshot.threads[0]?.checkpoints[0]?.completedAt, checkpointAt);
      const checkpointContext = Option.getOrThrow(
        yield* query.getThreadCheckpointContext(threadId),
      );
      assert.equal(checkpointContext.checkpoints[0]?.completedAt, checkpointAt);
      assert.deepEqual(
        yield* sql`SELECT completed_at FROM projection_turns WHERE thread_id = ${threadId}`,
        [{ completed_at: checkpointAt }],
      );
    }).pipe(Effect.provide(testLayer)),
  );
}
