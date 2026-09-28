import * as NodeServices from "@effect/platform-node/NodeServices";
import {
  ClickUpError,
  CommandId,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { TestClock } from "effect/testing";
import { ServerConfig } from "../config.ts";
import { OrchestrationEngineLive } from "../orchestration/Layers/OrchestrationEngine.ts";
import { OrchestrationProjectionPipelineLive } from "../orchestration/Layers/ProjectionPipeline.ts";
import { OrchestrationProjectionSnapshotQueryLive } from "../orchestration/Layers/ProjectionSnapshotQuery.ts";
import { OrchestrationEngineService } from "../orchestration/Services/OrchestrationEngine.ts";
import { ProjectionSnapshotQuery } from "../orchestration/Services/ProjectionSnapshotQuery.ts";
import * as ThreadBackgroundLiveness from "../orchestration/ThreadBackgroundLiveness.ts";
import * as ThreadPlanProgress from "../orchestration/ThreadPlanProgress.ts";
import { OrchestrationCommandReceiptRepositoryLive } from "../persistence/Layers/OrchestrationCommandReceipts.ts";
import { OrchestrationEventStoreLive } from "../persistence/Layers/OrchestrationEventStore.ts";
import { SqlitePersistenceMemory } from "../persistence/Layers/Sqlite.ts";
import * as RepositoryIdentityResolver from "../project/RepositoryIdentityResolver.ts";
import { ClickUpApi } from "./ClickUpApi.ts";
import { ClickUpConnection } from "./ClickUpConnection.ts";

export const CREATED = "2026-09-28T10:00:00.000Z";
export const CLOSED = "2026-09-28T11:00:00.000Z";
export const NOW = "2026-09-28T12:00:00.000Z";
export const threadId = ThreadId.make("thread");
export const task = { workspaceId: "42", taskId: "task", name: "Task" };
const isClickUpError = Schema.is(ClickUpError);

export function fixture() {
  const state = {
    token: "test-token",
    connected: true,
    response: {
      id: "task",
      team_id: "42",
      status: { type: "closed" },
      date_closed: String(Date.parse(CLOSED)),
    } as unknown,
    beforeRead: Effect.void,
    reads: 0,
    responses: new Map<string, unknown>(),
  };
  const account = () => ({
    configured: true,
    user: state.connected ? { id: 17, username: "Tester", avatarUrl: null } : null,
    workspaces: [{ id: "42", name: "Studio" }],
  });
  const layer = Layer.mergeAll(
    OrchestrationEngineLive.pipe(
      Layer.provide(OrchestrationProjectionSnapshotQueryLive),
      Layer.provide(OrchestrationProjectionPipelineLive),
    ),
    OrchestrationProjectionSnapshotQueryLive,
    Layer.mock(ClickUpApi)({
      request: (path) =>
        state.beforeRead.pipe(
          Effect.andThen(
            Effect.gen(function* () {
              state.reads++;
              const response = state.responses.get(path) ?? state.response;
              if (isClickUpError(response)) return yield* response;
              return response;
            }),
          ),
        ),
    }),
    Layer.mock(ClickUpConnection)({
      status: Effect.sync(account),
      account: Effect.sync(() => ({ token: state.token, connection: account() })),
    }),
  ).pipe(
    Layer.provideMerge(ThreadBackgroundLiveness.layer),
    Layer.provide(ThreadPlanProgress.layer),
    Layer.provide(OrchestrationEventStoreLive),
    Layer.provide(OrchestrationCommandReceiptRepositoryLive),
    Layer.provide(RepositoryIdentityResolver.layer),
    Layer.provideMerge(SqlitePersistenceMemory),
    Layer.provide(ServerConfig.layerTest(process.cwd(), { prefix: "t3-task-archive-test-" })),
    Layer.provideMerge(NodeServices.layer),
  );
  return { state, layer };
}

export const setup = Effect.gen(function* () {
  yield* TestClock.setTime(Date.parse(NOW));
  const engine = yield* OrchestrationEngineService;
  const snapshots = yield* ProjectionSnapshotQuery;
  const projectId = ProjectId.make("project");
  yield* engine.dispatch({
    type: "project.create",
    commandId: CommandId.make("project"),
    projectId,
    title: "Project",
    workspaceRoot: "/tmp/task-archive",
    createdAt: CREATED,
  });
  yield* engine.dispatch({
    type: "thread.create",
    commandId: CommandId.make("thread"),
    threadId,
    projectId,
    title: "Task discussion",
    modelSelection: { instanceId: ProviderInstanceId.make("codex"), model: "gpt-5" },
    runtimeMode: "full-access",
    interactionMode: "default",
    branch: null,
    worktreePath: null,
    createdAt: CREATED,
    clickUpTask: task,
  });
  const read = Effect.gen(function* () {
    const active = yield* snapshots.getThreadShellById(threadId);
    if (Option.isSome(active)) return active.value;
    return (yield* snapshots.getArchivedShellSnapshot()).threads.find(
      (thread) => thread.id === threadId,
    )!;
  });
  return { engine, snapshots, read };
});
