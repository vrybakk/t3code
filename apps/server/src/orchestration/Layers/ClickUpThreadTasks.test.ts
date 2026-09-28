import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import { CommandId, EventId, ProjectId, ProviderInstanceId, ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import { ServerConfig } from "../../config.ts";
import { SqlitePersistenceMemory } from "../../persistence/Layers/Sqlite.ts";
import { OrchestrationEventStoreLive } from "../../persistence/Layers/OrchestrationEventStore.ts";
import { OrchestrationEventStore } from "../../persistence/Services/OrchestrationEventStore.ts";
import * as ThreadBackgroundLiveness from "../ThreadBackgroundLiveness.ts";
import * as ThreadPlanProgress from "../ThreadPlanProgress.ts";
import * as RepositoryIdentityResolver from "../../project/RepositoryIdentityResolver.ts";
import { ProjectionSnapshotQuery } from "../Services/ProjectionSnapshotQuery.ts";
import { OrchestrationProjectionSnapshotQueryLive } from "./ProjectionSnapshotQuery.ts";
import { OrchestrationProjectionPipeline } from "../Services/ProjectionPipeline.ts";
import { OrchestrationProjectionPipelineLive } from "./ProjectionPipeline.ts";

const testLayer = Layer.merge(
  OrchestrationProjectionPipelineLive,
  OrchestrationProjectionSnapshotQueryLive,
).pipe(
  Layer.provide(ThreadBackgroundLiveness.layer),
  Layer.provide(ThreadPlanProgress.layer),
  Layer.provide(RepositoryIdentityResolver.layer),
  Layer.provideMerge(OrchestrationEventStoreLive),
  Layer.provideMerge(ServerConfig.layerTest(process.cwd(), { prefix: "t3-clickup-projection-" })),
  Layer.provideMerge(SqlitePersistenceMemory),
  Layer.provideMerge(NodeServices.layer),
);

it.effect("replays durable task identity and clears it when a thread id is recreated", () =>
  Effect.gen(function* () {
    const events = yield* OrchestrationEventStore;
    const pipeline = yield* OrchestrationProjectionPipeline;
    const sql = yield* SqlClient.SqlClient;
    const snapshots = yield* ProjectionSnapshotQuery;
    const threadId = ThreadId.make("clickup-thread");
    const at = "2026-09-24T10:00:00.000Z";
    const payload = {
      threadId,
      projectId: ProjectId.make("clickup-project"),
      title: "Task implementation",
      modelSelection: { instanceId: ProviderInstanceId.make("codex"), model: "gpt-5" },
      runtimeMode: "full-access" as const,
      interactionMode: "default" as const,
      branch: null,
      worktreePath: null,
      createdAt: at,
      updatedAt: at,
    };
    const base = {
      aggregateKind: "thread" as const,
      aggregateId: threadId,
      occurredAt: at,
      causationEventId: null,
      correlationId: null,
      metadata: {},
    };
    yield* events.append({
      ...base,
      type: "thread.created",
      eventId: EventId.make("clickup-created"),
      commandId: CommandId.make("clickup-create"),
      payload: {
        ...payload,
        clickUpTask: { workspaceId: "42", taskId: "abc", name: "Fix checkout" },
      },
    });
    yield* pipeline.bootstrap;
    assert.deepEqual(
      yield* sql`SELECT workspace_id, task_id FROM projection_thread_clickup_tasks WHERE thread_id = ${threadId}`,
      [{ workspace_id: "42", task_id: "abc" }],
    );
    yield* pipeline.bootstrap;
    assert.equal((yield* sql`SELECT * FROM projection_thread_clickup_tasks`).length, 1);
    const context = {
      workspaceId: "42",
      taskId: "context",
      name: "Related context",
      primary: false,
    };
    const linked = yield* events.append({
      ...base,
      type: "thread.task-linked",
      eventId: EventId.make("context-linked"),
      commandId: CommandId.make("link-context"),
      payload: { threadId, link: context, updatedAt: at },
    });
    yield* pipeline.projectEvent(linked);
    const expected = [
      { workspaceId: "42", taskId: "abc", name: "Fix checkout", primary: true },
      context,
    ];
    for (const read of [
      snapshots.getSnapshot(),
      snapshots.getCommandReadModel(),
      snapshots.getShellSnapshot(),
    ]) {
      assert.deepEqual((yield* read).threads[0]?.clickUpTasks, expected);
    }
    for (const read of [
      snapshots.getThreadShellById(threadId),
      snapshots.getThreadDetailById(threadId),
    ]) {
      const result = yield* read;
      assert.equal(result._tag, "Some");
      if (result._tag === "Some") assert.deepEqual(result.value.clickUpTasks, expected);
    }
    yield* pipeline.bootstrap;
    assert.equal((yield* sql`SELECT * FROM projection_thread_clickup_tasks`).length, 2);
    const unlinked = yield* events.append({
      ...base,
      type: "thread.task-unlinked",
      eventId: EventId.make("context-unlinked"),
      commandId: CommandId.make("unlink-context"),
      payload: { threadId, workspaceId: "42", taskId: "context", updatedAt: at },
    });
    yield* pipeline.projectEvent(unlinked);
    assert.deepEqual(
      (yield* snapshots.getCommandReadModel()).threads[0]?.clickUpTasks,
      expected.slice(0, 1),
    );
    const recreated = yield* events.append({
      ...base,
      type: "thread.created",
      eventId: EventId.make("clickup-recreated"),
      commandId: CommandId.make("clickup-recreate"),
      payload,
    });
    yield* pipeline.projectEvent(recreated);
    assert.deepEqual(yield* sql`SELECT * FROM projection_thread_clickup_tasks`, []);
  }).pipe(Effect.provide(testLayer)),
);
