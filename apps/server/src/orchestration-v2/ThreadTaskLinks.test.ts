import { assert, describe, it } from "@effect/vitest";
import {
  CommandId,
  ProjectId,
  ProviderDriverKind,
  ProviderInstanceId,
  ThreadId,
  ThreadClickUpTaskLink,
  type ClickUpTaskReference,
  type ThreadClickUpTaskLinkUpdate,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import * as SqlClient from "effect/sql/SqlClient";
import * as SqlitePersistence from "../persistence/Sqlite.ts";
import { CodexProviderCapabilitiesV2 } from "./Adapters/CodexAdapterV2.ts";
import * as Orchestrator from "./Orchestrator.ts";
import * as ProjectionStore from "./ProjectionStore.ts";
import type { ProviderAdapterV2Shape } from "./ProviderAdapter.ts";
import * as ProviderAdapterRegistry from "./ProviderAdapterRegistry.ts";
import * as ProviderReplayHarness from "./testkit/ProviderReplayHarness.ts";

const instanceId = ProviderInstanceId.make("codex");
const adapter = {
  instanceId,
  driver: ProviderDriverKind.make("codex"),
  getCapabilities: () => Effect.succeed(CodexProviderCapabilitiesV2),
  planSelectionTransition: () => Effect.succeed({ type: "apply_on_next_turn" as const }),
  openSession: () => Effect.die("Task links do not require a provider process"),
} as ProviderAdapterV2Shape;
const database = SqlitePersistence.layerMemory;
const testLayer = Layer.mergeAll(
  database,
  ProjectionStore.layer.pipe(Layer.provide(database)),
  ProviderReplayHarness.layerWithRegistry(
    { name: "task-links" },
    ProviderAdapterRegistry.layerFromAdapters([adapter]),
    { databaseLayer: database, runEffectWorker: false },
  ),
);
const threadId = ThreadId.make("thread:task-links");
const decodeStoredLinks = Schema.decodeEffect(
  Schema.fromJsonString(Schema.Struct({ clickUpTasks: Schema.Array(ThreadClickUpTaskLink) })),
);
const task = (taskId: string): ClickUpTaskReference => ({
  workspaceId: "workspace",
  taskId,
  name: `Task ${taskId}`,
});
const createThread = Effect.gen(function* () {
  const orchestrator = yield* Orchestrator.OrchestratorV2;
  return yield* orchestrator.dispatch({
    type: "thread.create",
    commandId: CommandId.make("create-task-links"),
    threadId,
    projectId: ProjectId.make("project:task-links"),
    title: "Task links",
    clickUpTask: task("A"),
    modelSelection: { instanceId, model: "gpt-5.1-codex" },
    runtimeMode: "full-access",
    interactionMode: "default",
    branch: null,
    worktreePath: null,
    createdBy: "user",
    creationSource: "web",
  });
});
const updateLink = Effect.fnUntraced(function* (
  commandId: string,
  clickUpTaskLinkUpdate: ThreadClickUpTaskLinkUpdate,
) {
  const orchestrator = yield* Orchestrator.OrchestratorV2;
  return yield* orchestrator.dispatch({
    type: "thread.metadata.update",
    commandId: CommandId.make(commandId),
    threadId,
    clickUpTaskLinkUpdate,
  });
});

describe("ClickUp task links", () => {
  it.effect("persists a primary task on creation and context links in shells", () =>
    Effect.gen(function* () {
      yield* createThread;
      yield* updateLink("link-B", { type: "link", task: task("B") });
      yield* updateLink("link-B-again", { type: "link", task: task("B") });
      const expected = [
        { ...task("A"), primary: true },
        { ...task("B"), primary: false },
      ];
      const projections = yield* ProjectionStore.ProjectionStoreV2;
      assert.deepStrictEqual((yield* projections.getThreadShell(threadId))?.clickUpTasks, expected);
      const sql = yield* SqlClient.SqlClient;
      const rows = yield* sql<{ readonly payload_json: string }>`
        SELECT payload_json FROM orchestration_v2_projection_threads WHERE thread_id = ${threadId}
      `;
      const stored = yield* decodeStoredLinks(rows[0]!.payload_json);
      assert.deepStrictEqual(stored.clickUpTasks, expected);
    }).pipe(Effect.provide(testLayer)),
  );

  it.effect("keeps concurrent additions and does not resurrect concurrent removals", () =>
    Effect.gen(function* () {
      yield* createThread;
      yield* Effect.all(
        [
          updateLink("add-B", { type: "link", task: task("B") }),
          updateLink("add-C", { type: "link", task: task("C") }),
        ],
        { concurrency: "unbounded" },
      );
      const projections = yield* ProjectionStore.ProjectionStoreV2;
      const linked = (yield* projections.getThreadShell(threadId))?.clickUpTasks ?? [];
      assert.deepStrictEqual(linked.map((link) => link.taskId).sort(), ["A", "B", "C"]);
      assert.deepStrictEqual(
        linked.filter((link) => link.primary).map((link) => link.taskId),
        ["A"],
      );
      yield* Effect.all(
        [
          updateLink("remove-A", { type: "unlink", workspaceId: "workspace", taskId: "A" }),
          updateLink("remove-B", { type: "unlink", workspaceId: "workspace", taskId: "B" }),
        ],
        { concurrency: "unbounded" },
      );
      yield* updateLink("remove-B-again", {
        type: "unlink",
        workspaceId: "workspace",
        taskId: "B",
      });
      assert.deepStrictEqual((yield* projections.getThreadShell(threadId))?.clickUpTasks, [
        { ...task("C"), primary: true },
      ]);
    }).pipe(Effect.provide(testLayer)),
  );

  it.effect("preserves a surviving primary even when it is not the first link", () =>
    Effect.gen(function* () {
      yield* createThread;
      const orchestrator = yield* Orchestrator.OrchestratorV2;
      yield* orchestrator.dispatch({
        type: "thread.metadata.update",
        commandId: CommandId.make("reorder-links"),
        threadId,
        clickUpTasks: [
          { ...task("A"), primary: false },
          { ...task("B"), primary: true },
          { ...task("C"), primary: false },
        ],
      });
      yield* updateLink("unlink-context", {
        type: "unlink",
        workspaceId: "workspace",
        taskId: "C",
      });
      const projections = yield* ProjectionStore.ProjectionStoreV2;
      assert.deepStrictEqual((yield* projections.getThreadShell(threadId))?.clickUpTasks, [
        { ...task("A"), primary: false },
        { ...task("B"), primary: true },
      ]);
      yield* updateLink("unlink-primary", {
        type: "unlink",
        workspaceId: "workspace",
        taskId: "B",
      });
      assert.deepStrictEqual((yield* projections.getThreadShell(threadId))?.clickUpTasks, [
        { ...task("A"), primary: true },
      ]);
      yield* updateLink("unlink-last", { type: "unlink", workspaceId: "workspace", taskId: "A" });
      assert.deepStrictEqual((yield* projections.getThreadShell(threadId))?.clickUpTasks, []);
    }).pipe(Effect.provide(testLayer)),
  );
});
