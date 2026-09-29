import * as NodeServices from "@effect/platform-node/NodeServices";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import { ProjectCloneTracker } from "../../../project/ProjectCloneTracker.ts";
import * as Option from "effect/Option";
import { ServerSettingsService } from "../../../serverSettings.ts";
import { ProjectionSnapshotQuery } from "../../../orchestration/Services/ProjectionSnapshotQuery.ts";
import { RepositoryIdentityResolver } from "../../../project/RepositoryIdentityResolver.ts";
import { assert, it } from "@effect/vitest";
import {
  ClickUpError,
  DEFAULT_SERVER_SETTINGS,
  ProjectId,
  type ServerSettings,
  type ProjectCloneSnapshot,
  type OrchestrationProjectShell,
  EnvironmentId,
  ProviderInstanceId,
  ThreadId,
  type ClickUpCompleteEstimationInput,
  type ClickUpTaskInput,
} from "@t3tools/contracts";
import * as NodeSqliteClient from "@t3tools/shared/nodeSqliteClient";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import type { Tool } from "effect/unstable/ai";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import { ClickUpConnection } from "../../../clickup/ClickUpConnection.ts";
import { ClickUpTaskEditing } from "../../../clickup/ClickUpTaskEditing.ts";
import { ClickUpWorkflow } from "../../../clickup/ClickUpWorkflow.ts";
import { ClickUpTasks } from "../../../clickup/ClickUpTasks.ts";
import { ClickUpApi } from "../../../clickup/ClickUpApi.ts";
import { layer as ClickUpInteractionsLive } from "../../../clickup/ClickUpInteractions.ts";
import { McpInvocationContext, type McpCapability } from "../../McpInvocationContext.ts";
import { ClickUpToolkitHandlersLive } from "./handlers.ts";
import { ClickUpToolkit } from "./tools.ts";

const decodeLinkedTaskParameters = Schema.decodeUnknownEffect(
  ClickUpToolkit.tools.get_linked_clickup_task.parametersSchema,
);

const makeHarness = Effect.fn("makeClickUpToolkitHarness")(function* (
  options: {
    resolve?: RepositoryIdentityResolver["Service"]["resolve"];
    clones?: ReadonlyArray<ProjectCloneSnapshot>;
    settings?: ServerSettings;
    projects?: ReadonlyArray<OrchestrationProjectShell>;
    linked?: boolean;
    contextLinked?: boolean;
    extraContext?: boolean;
    deleted?: boolean;
    userId?: number | null;
    failEstimate?: boolean;
    tagRemoved?: boolean;
  } = {},
) {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`CREATE TABLE projection_threads (thread_id TEXT PRIMARY KEY, deleted_at TEXT)`;
  yield* sql`CREATE TABLE projection_thread_clickup_tasks (thread_id TEXT, workspace_id TEXT, task_id TEXT, is_primary INTEGER NOT NULL DEFAULT 1, PRIMARY KEY (thread_id, workspace_id, task_id))`;
  yield* sql`INSERT INTO projection_threads (thread_id, deleted_at) VALUES ('own-thread', ${options.deleted ? "2026-09-24T12:00:00.000Z" : null}), ('other-thread', NULL)`;
  yield* sql`INSERT INTO projection_thread_clickup_tasks (thread_id, workspace_id, task_id) VALUES ('other-thread', 'other-workspace', 'other-task')`;
  if (options.contextLinked !== false)
    yield* sql`INSERT INTO projection_thread_clickup_tasks VALUES ('own-thread', '42', 'context-task', 0)`;
  if (options.extraContext)
    yield* sql`INSERT INTO projection_thread_clickup_tasks VALUES ('own-thread', '43', 'second-context', 0)`;
  if (options.linked !== false)
    yield* sql`INSERT INTO projection_thread_clickup_tasks (thread_id, workspace_id, task_id) VALUES ('own-thread', '42', 'own-task')`;
  const calls = {
    accountReads: 0,
    reads: [] as ClickUpTaskInput[],
    estimates: [] as ClickUpCompleteEstimationInput[],
    starts: [] as ClickUpTaskInput[],
    findings: [] as ClickUpTaskInput[],
    handoffs: [] as Array<{ task: ClickUpTaskInput; threadId: ThreadId }>,
    requests: [] as string[],
  };
  const userId = options.userId === undefined ? 73 : options.userId;
  const baseDependencies = Layer.mergeAll(
    Layer.mock(ProjectCloneTracker)({ stream: Stream.succeed(options.clones ?? []) }),
    Layer.mock(ServerSettingsService)({
      getSettings: Effect.sync(() => options.settings ?? DEFAULT_SERVER_SETTINGS),
    }),
    Layer.mock(RepositoryIdentityResolver)({
      resolve: options.resolve ?? (() => Effect.succeed(null)),
    }),
    Layer.mock(ProjectionSnapshotQuery)({
      getProjectShells: () => Effect.succeed(options.projects ?? []),
      getThreadRuntimeContext: (id) =>
        Effect.succeed(
          Option.some({
            id,
            projectId: ProjectId.make("manual"),
            title: "Task",
            titleState: null,
            session: null,
          }),
        ),
    }),
    Layer.succeed(ClickUpApi, {
      request: (path) =>
        Effect.sync(() => {
          calls.requests.push(path);
          const comment = (id: string) => ({
            id,
            date: "1700000000000",
            user: { id: 73, username: "Developer" },
            comment_text: id,
          });
          if (path === "comment/older-comment/reply") return { comments: [comment("reply")] };
          if (path.includes("/comment"))
            return {
              comments: path.includes("start_id=recent-24")
                ? [comment("older-comment")]
                : Array.from({ length: 25 }, (_, index) => comment(`recent-${index}`)),
            };
          return {
            id: path.split("/")[1],
            team_id: "42",
            name: "Task",
            status: { status: "open" },
            list: { name: "Sprint" },
          };
        }),
    }),
    Layer.mock(ClickUpWorkflow)({
      start: (task) =>
        Effect.sync(() => {
          calls.starts.push(task);
        }),
      findings: (task) =>
        Effect.sync(() => {
          calls.findings.push(task);
        }),
      prepare: (task, threadId, input) =>
        Effect.sync(() => {
          calls.handoffs.push({ task, threadId });
          return {
            id: "handoff",
            threadId,
            summary: input.summary,
            createdAt: "2026-09-29T00:00:00.000Z",
            status: "pending" as const,
            error: null,
            evidence: input.evidence,
            pullRequests: [],
            statusUpdated: false,
            commentPosted: false,
          };
        }),
    }),
    Layer.succeed(SqlClient.SqlClient, sql),
    Layer.mock(ClickUpConnection)({
      account: Effect.sync(() => {
        calls.accountReads += 1;
        return {
          token: "fixture-token",
          connection: {
            configured: true,
            user: userId === null ? null : { id: userId, username: "Current developer" },
            workspaces: [{ id: "42", name: "Studio" }],
          },
        };
      }),
    }),
    Layer.mock(ClickUpTasks)({
      detail: (input) =>
        Effect.sync(() => {
          calls.reads.push(input);
          return {
            task: {
              workspaceId: input.workspaceId,
              taskId: input.taskId,
              name: "Own task",
              status: "open",
              listName: "Sprint",
              description: "Current requirements",
              sources: [
                { kind: "list", id: "list", name: "Sprint" },
                { kind: "space", id: "space", name: "Studio" },
              ],
            },
            comments: [],
            commentsMayHaveMore: false,
            attachments: [],
          };
        }),
    }),
    Layer.mock(ClickUpTaskEditing)({
      completeEstimation: (input) =>
        Effect.gen(function* () {
          calls.estimates.push(input);
          if (options.failEstimate)
            return yield* new ClickUpError({ message: "Provider rejected estimate" });
          return { estimateMinutes: input.estimateMinutes, tagRemoved: options.tagRemoved ?? true };
        }),
    }),
  );
  const dependencies = Layer.merge(
    baseDependencies,
    ClickUpInteractionsLive.pipe(Layer.provide(baseDependencies)),
  );
  const toolkit = yield* ClickUpToolkit.pipe(
    Effect.provide(ClickUpToolkitHandlersLive.pipe(Layer.provide(dependencies))),
  );
  const call = <Name extends keyof typeof ClickUpToolkit.tools>(
    name: Name,
    params: Parameters<typeof toolkit.handle<Name>>[1],
    capabilities: ReadonlyArray<McpCapability> = ["clickup"],
  ) =>
    toolkit.handle(name, params).pipe(
      Stream.unwrap,
      Stream.runCollect,
      Effect.map(
        (chunk) => chunk.at(-1)!.result as Tool.Success<(typeof ClickUpToolkit.tools)[Name]>,
      ),
      Effect.provideService(McpInvocationContext, {
        environmentId: EnvironmentId.make("own-environment"),
        threadId: ThreadId.make("own-thread"),
        providerSessionId: "own-provider-session",
        providerInstanceId: ProviderInstanceId.make("codex"),
        capabilities: new Set(capabilities),
        issuedAt: 1,
      }),
      Effect.provide(dependencies),
    );
  return { calls, call };
});

const handoffInput = {
  summary: "Ready for review.",
  reviewedTaskScope: "task-scope",
  evidence: [
    { kind: "independent-review" as const, outcome: "passed" as const, details: "Reviewed." },
    { kind: "verification" as const, outcome: "passed" as const, details: "Verified." },
  ],
  reviewedHeads: [{ url: "https://github.com/example/repo/pull/1", headSha: "abc123" }],
};

it.effect("rejects missing ClickUp capability before account reads or mutations", () =>
  Effect.gen(function* () {
    const harness = yield* makeHarness();
    const failure = yield* harness
      .call("complete_clickup_estimation", { estimateMinutes: 30 }, ["pull-requests"])
      .pipe(Effect.flip);
    assert.equal(failure._tag, "McpCapabilityUnavailableError");
    assert.equal(harness.calls.accountReads, 0);
    assert.deepEqual(harness.calls.estimates, []);
  }).pipe(Effect.provide(NodeSqliteClient.layer({ filename: ":memory:" }))),
);

for (const options of [{ linked: false, contextLinked: false }, { deleted: true }]) {
  it.effect(
    `rejects a ${options.linked === false ? "missing link" : "deleted thread"} without using another thread's task`,
    () =>
      Effect.gen(function* () {
        const harness = yield* makeHarness(options);
        const failure = yield* harness
          .call("complete_clickup_estimation", { estimateMinutes: 30 })
          .pipe(Effect.flip);
        assert.equal(failure._tag, "ClickUpError");
        assert.equal(harness.calls.accountReads, 0);
        assert.deepEqual(harness.calls.estimates, []);
      }).pipe(Effect.provide(NodeSqliteClient.layer({ filename: ":memory:" }))),
  );
}

it.effect("reads only the invocation thread's durable task using the current account", () =>
  Effect.gen(function* () {
    const harness = yield* makeHarness({ userId: 91 });
    const details = yield* harness.call("get_linked_clickup_task", {});
    assert.equal(details.task.taskId, "own-task");
    assert.deepEqual(harness.calls.reads, [{ workspaceId: "42", taskId: "own-task", userId: 91 }]);
  }).pipe(Effect.provide(NodeSqliteClient.layer({ filename: ":memory:" }))),
);

it.effect("uses a sole context task across the workflow without requiring a primary link", () =>
  Effect.gen(function* () {
    const harness = yield* makeHarness({ linked: false });
    const expected = { workspaceId: "42", taskId: "context-task", userId: 73 };
    const details = yield* harness.call("get_linked_clickup_task", {});
    assert.equal(details.task.taskId, expected.taskId);
    yield* harness.call("get_studio_task_workflow", { mode: "implement" });
    yield* harness.call("start_linked_clickup_implementation", {});
    const comments = yield* harness.call("get_linked_clickup_comments", {});
    yield* harness.call("get_linked_clickup_comment_replies", {
      commentId: "older-comment",
      cursor: comments.nextCursor!,
    });
    yield* harness.call("post_linked_clickup_findings", {
      text: "Missing acceptance criteria.",
      actionable: true,
    });
    yield* harness.call("complete_clickup_estimation", { estimateMinutes: 30 });
    yield* harness.call("prepare_linked_clickup_handoff", handoffInput);
    assert.deepEqual(harness.calls.reads, [expected, expected]);
    assert.deepEqual(harness.calls.starts, [expected]);
    assert.deepEqual(harness.calls.findings, [expected]);
    assert.deepEqual(harness.calls.estimates, [{ ...expected, estimateMinutes: 30 }]);
    assert.deepEqual(harness.calls.handoffs, [{ task: expected, threadId: "own-thread" }]);
    const sql = yield* SqlClient.SqlClient;
    const links = yield* sql<{
      is_primary: number;
    }>`SELECT is_primary FROM projection_thread_clickup_tasks WHERE thread_id = 'own-thread'`;
    assert.deepEqual(
      links.map((link) => link.is_primary),
      [0],
    );
  }).pipe(Effect.provide(NodeSqliteClient.layer({ filename: ":memory:" }))),
);

it.effect("asks for an explicit task when several context tasks have no primary", () =>
  Effect.gen(function* () {
    const harness = yield* makeHarness({ linked: false, extraContext: true });
    const operations = [
      harness.call("get_linked_clickup_task", {}),
      harness.call("get_studio_task_workflow", { mode: "implement" }),
      harness.call("start_linked_clickup_implementation", {}),
      harness.call("get_linked_clickup_comments", {}),
      harness.call("get_linked_clickup_comment_replies", { commentId: "older-comment" }),
      harness.call("post_linked_clickup_findings", { text: "Missing criteria.", actionable: true }),
      harness.call("complete_clickup_estimation", { estimateMinutes: 30 }),
      harness.call("prepare_linked_clickup_handoff", handoffInput),
    ];
    for (const operation of operations) {
      const error = yield* operation.pipe(Effect.flip);
      assert.equal(error._tag, "ClickUpError");
      assert.include(error.message, "Multiple ClickUp tasks are linked");
      assert.include(error.message, '"workspaceId":"42","taskId":"context-task"');
      assert.include(error.message, '"workspaceId":"43","taskId":"second-context"');
      assert.notInclude(error.message, "other-task");
    }
    assert.equal(harness.calls.accountReads, 0);
    assert.deepEqual(harness.calls.starts, []);
    assert.deepEqual(harness.calls.estimates, []);
    const selected = yield* harness.call("get_linked_clickup_task", {
      task: { workspaceId: "43", taskId: "second-context" },
    });
    assert.equal(selected.task.taskId, "second-context");
  }).pipe(Effect.provide(NodeSqliteClient.layer({ filename: ":memory:" }))),
);

it.effect("reads and starts an explicitly selected context task without changing the primary", () =>
  Effect.gen(function* () {
    const harness = yield* makeHarness();
    const task = { workspaceId: "42", taskId: "context-task" };
    const details = yield* harness.call("get_linked_clickup_task", { task });
    assert.equal(details.task.taskId, "context-task");
    yield* harness.call("start_linked_clickup_implementation", { task });
    assert.deepEqual(harness.calls.starts, [{ ...task, userId: 73 }]);
    const primary = yield* harness.call("get_linked_clickup_task", {});
    assert.equal(primary.task.taskId, "own-task");
  }).pipe(Effect.provide(NodeSqliteClient.layer({ filename: ":memory:" }))),
);

it.effect("uses the selected linked task for every workflow and comment operation", () =>
  Effect.gen(function* () {
    const harness = yield* makeHarness();
    const task = { workspaceId: "42", taskId: "context-task" };
    yield* harness.call("get_studio_task_workflow", { mode: "implement", task });
    assert.deepEqual(harness.calls.reads, [{ ...task, userId: 73 }]);
    const comments = yield* harness.call("get_linked_clickup_comments", { task });
    yield* harness.call("get_linked_clickup_comment_replies", {
      task,
      commentId: "older-comment",
      cursor: comments.nextCursor!,
    });
    assert.deepEqual(harness.calls.requests, [
      "task/context-task",
      "task/context-task/comment",
      "task/context-task",
      "task/context-task/comment?start_id=recent-24&start=1700000000000",
      "comment/older-comment/reply",
    ]);
    yield* harness.call("complete_clickup_estimation", { task, estimateMinutes: 30 });
    yield* harness.call("post_linked_clickup_findings", {
      task,
      text: "Acceptance criteria are missing.",
      actionable: true,
    });
    yield* harness.call("prepare_linked_clickup_handoff", { ...handoffInput, task });
    assert.deepEqual(harness.calls.estimates, [{ ...task, userId: 73, estimateMinutes: 30 }]);
    assert.deepEqual(harness.calls.findings, [{ ...task, userId: 73 }]);
    assert.deepEqual(harness.calls.handoffs, [
      { task: { ...task, userId: 73 }, threadId: "own-thread" },
    ]);
  }).pipe(Effect.provide(NodeSqliteClient.layer({ filename: ":memory:" }))),
);

for (const task of [
  { workspaceId: "42", taskId: "unlinked" },
  { workspaceId: "other-workspace", taskId: "other-task" },
  { workspaceId: "other-workspace", taskId: "context-task" },
]) {
  it.effect(`rejects ${task.workspaceId}/${task.taskId} before any external calls`, () =>
    Effect.gen(function* () {
      const harness = yield* makeHarness();
      const operations = [
        harness.call("get_linked_clickup_task", { task }),
        harness.call("get_studio_task_workflow", { task, mode: "implement" }),
        harness.call("get_linked_clickup_comments", { task }),
        harness.call("get_linked_clickup_comment_replies", { task, commentId: "older-comment" }),
        harness.call("start_linked_clickup_implementation", { task }),
        harness.call("complete_clickup_estimation", { task, estimateMinutes: 30 }),
        harness.call("post_linked_clickup_findings", {
          task,
          text: "Missing criteria.",
          actionable: true,
        }),
        harness.call("prepare_linked_clickup_handoff", { task, ...handoffInput }),
      ];
      for (const operation of operations) {
        const error = yield* operation.pipe(Effect.flip);
        assert.equal(error._tag, "ClickUpError");
      }
      assert.equal(harness.calls.accountReads, 0);
      assert.deepEqual(harness.calls.reads, []);
      assert.deepEqual(harness.calls.requests, []);
      assert.deepEqual(harness.calls.estimates, []);
      assert.deepEqual(harness.calls.starts, []);
      assert.deepEqual(harness.calls.findings, []);
      assert.deepEqual(harness.calls.handoffs, []);
    }).pipe(Effect.provide(NodeSqliteClient.layer({ filename: ":memory:" }))),
  );
}

it.effect("rejects malformed selectors instead of falling back to the primary task", () =>
  Effect.gen(function* () {
    const harness = yield* makeHarness();
    for (const task of [
      { taskId: "context-task" },
      { workspaceId: "42" },
      { workspaceId: "", taskId: "context-task" },
      null,
    ]) {
      const result = yield* decodeLinkedTaskParameters({ task }).pipe(
        Effect.flatMap((input) => harness.call("get_linked_clickup_task", input)),
        Effect.result,
      );
      assert.equal(result._tag, "Failure");
    }
    assert.equal(harness.calls.accountReads, 0);
    assert.deepEqual(harness.calls.reads, []);
  }).pipe(Effect.provide(NodeSqliteClient.layer({ filename: ":memory:" }))),
);

it.effect("rejects an explicit task linked to a deleted invocation thread", () =>
  Effect.gen(function* () {
    const harness = yield* makeHarness({ deleted: true });
    const error = yield* harness
      .call("start_linked_clickup_implementation", {
        task: { workspaceId: "42", taskId: "context-task" },
      })
      .pipe(Effect.flip);
    assert.equal(error._tag, "ClickUpError");
    assert.equal(harness.calls.accountReads, 0);
    assert.deepEqual(harness.calls.starts, []);
  }).pipe(Effect.provide(NodeSqliteClient.layer({ filename: ":memory:" }))),
);

it.effect("strips forged identity fields before invoking the estimation handler", () =>
  Effect.gen(function* () {
    const harness = yield* makeHarness();
    const forged = {
      estimateMinutes: 45,
      taskId: "other-task",
      workspaceId: "other-workspace",
      userId: 999,
      threadId: "other-thread",
    };
    yield* harness.call("complete_clickup_estimation", forged);
    assert.deepEqual(harness.calls.estimates, [
      { workspaceId: "42", taskId: "own-task", userId: 73, estimateMinutes: 45 },
    ]);
  }).pipe(Effect.provide(NodeSqliteClient.layer({ filename: ":memory:" }))),
);

it.effect("rejects a disconnected ClickUp account without invoking a mutation", () =>
  Effect.gen(function* () {
    const harness = yield* makeHarness({ userId: null });
    const failure = yield* harness
      .call("complete_clickup_estimation", { estimateMinutes: 30 })
      .pipe(Effect.flip);
    assert.equal(failure._tag, "ClickUpError");
    assert.deepEqual(harness.calls.estimates, []);
  }).pipe(Effect.provide(NodeSqliteClient.layer({ filename: ":memory:" }))),
);

it.effect("preserves partial success so the agent cannot claim tag cleanup succeeded", () =>
  Effect.gen(function* () {
    const harness = yield* makeHarness({ tagRemoved: false });
    assert.deepEqual(yield* harness.call("complete_clickup_estimation", { estimateMinutes: 30 }), {
      estimateMinutes: 30,
      tagRemoved: false,
    });
  }).pipe(Effect.provide(NodeSqliteClient.layer({ filename: ":memory:" }))),
);

it.effect("propagates provider errors instead of producing a success receipt", () =>
  Effect.gen(function* () {
    const harness = yield* makeHarness({ failEstimate: true });
    const failure = yield* harness
      .call("complete_clickup_estimation", { estimateMinutes: 30 })
      .pipe(Effect.flip);
    assert.equal(failure._tag, "ClickUpError");
    assert.equal(failure.message, "Provider rejected estimate");
  }).pipe(Effect.provide(NodeSqliteClient.layer({ filename: ":memory:" }))),
);

it.effect("starts only the authenticated thread's task and rejects missing capability", () =>
  Effect.gen(function* () {
    const harness = yield* makeHarness();
    yield* harness.call("start_linked_clickup_implementation", {});
    assert.deepEqual(harness.calls.starts, [{ workspaceId: "42", taskId: "own-task", userId: 73 }]);
    assert.equal(
      (yield* Effect.result(harness.call("start_linked_clickup_implementation", {}, [])))._tag,
      "Failure",
    );
    assert.equal(harness.calls.starts.length, 1);
  }).pipe(Effect.provide(NodeSqliteClient.layer({ filename: ":memory:" }))),
);

it.effect(
  "reads older linked-task comments and their replies without accepting forged task identity",
  () =>
    Effect.gen(function* () {
      const harness = yield* makeHarness();
      const first = yield* harness.call("get_linked_clickup_comments", {});
      assert.isTrue(first.hasMore);
      assert.deepEqual(first.nextCursor, { id: "recent-24", date: "1700000000000" });
      const cursor = first.nextCursor!;
      const older = yield* harness.call("get_linked_clickup_comments", { cursor });
      assert.deepEqual(
        older.comments.map((comment) => comment.id),
        ["older-comment"],
      );
      assert.isFalse(older.hasMore);
      const forged = {
        commentId: "older-comment",
        cursor,
        taskId: "other-task",
        workspaceId: "other-workspace",
        userId: 999,
      };
      const replies = yield* harness.call("get_linked_clickup_comment_replies", forged);
      assert.deepEqual(
        replies.comments.map((comment) => comment.text),
        ["reply"],
      );
      assert.deepEqual(harness.calls.requests.slice(-3), [
        "task/own-task",
        "task/own-task/comment?start_id=recent-24&start=1700000000000",
        "comment/older-comment/reply",
      ]);
    }).pipe(Effect.provide(NodeSqliteClient.layer({ filename: ":memory:" }))),
);

it.effect("rejects a foreign parent comment before reading its replies", () =>
  Effect.gen(function* () {
    const harness = yield* makeHarness();
    const failure = yield* harness
      .call("get_linked_clickup_comment_replies", { commentId: "foreign-comment" })
      .pipe(Effect.flip);
    assert.equal(failure._tag, "ClickUpError");
    assert.deepEqual(harness.calls.requests, ["task/own-task", "task/own-task/comment"]);
  }).pipe(Effect.provide(NodeSqliteClient.layer({ filename: ":memory:" }))),
);

for (const options of [{ linked: false, contextLinked: false }, { deleted: true }]) {
  it.effect(
    `rejects comment reads for ${options.linked === false ? "unlinked" : "deleted"} threads`,
    () =>
      Effect.gen(function* () {
        const harness = yield* makeHarness(options);
        assert.equal(
          (yield* Effect.result(harness.call("get_linked_clickup_comments", {})))._tag,
          "Failure",
        );
        assert.equal(
          (yield* Effect.result(
            harness.call("get_linked_clickup_comment_replies", { commentId: "older-comment" }),
          ))._tag,
          "Failure",
        );
        assert.deepEqual(harness.calls.requests, []);
        assert.equal(harness.calls.accountReads, 0);
      }).pipe(Effect.provide(NodeSqliteClient.layer({ filename: ":memory:" }))),
  );
}

it.effect(
  "supplies current model preferences and scoped repositories through the workflow tool",
  () =>
    Effect.gen(function* () {
      const project = (id: string): OrchestrationProjectShell => ({
        id: ProjectId.make(id),
        title: id,
        workspaceRoot: `/workspace/${id}`,
        defaultModelSelection: null,
        scripts: [],
        createdAt: "2026-09-28T00:00:00.000Z",
        updatedAt: "2026-09-28T00:00:00.000Z",
      });
      const settings = {
        ...DEFAULT_SERVER_SETTINGS,
        clickUpWorkflowModels: {
          research: {
            instanceId: ProviderInstanceId.make("codex"),
            model: "research-model",
            options: [{ id: "reasoningEffort", value: "high" }],
          },
          implementation: { instanceId: ProviderInstanceId.make("codex"), model: "legacy-model" },
          review: { instanceId: ProviderInstanceId.make("claude-code"), model: "review-model" },
        },
        clickUpProjectMappings: {
          "42:list::list": [ProjectId.make("mapped")],
          "42:space::space": [ProjectId.make("unrelated")],
        },
      };
      const projects = [project("manual"), project("mapped"), project("unrelated")];
      const harness = yield* makeHarness({ settings, projects });
      const result = yield* harness.call("get_studio_task_workflow", { mode: "implement" });
      assert.include(result.instructions, '"research"');
      assert.include(result.instructions, '"model":"research-model"');
      assert.include(result.instructions, '"value":"high"');
      assert.include(result.instructions, '"instanceId":"claude-code"');
      assert.include(result.instructions, '"model":"review-model"');
      assert.notInclude(result.instructions, "legacy-model");
      assert.include(result.instructions, "/workspace/mapped");
      assert.include(result.instructions, "/workspace/manual");
      assert.notInclude(result.instructions, "/workspace/unrelated");
      settings.clickUpWorkflowModels.research.model = "updated-model";
      const refreshed = yield* harness.call("get_studio_task_workflow", { mode: "implement" });
      assert.include(refreshed.instructions, "updated-model");
      assert.notInclude(refreshed.instructions, "research-model");
      projects.splice(1, 1);
      const missing = yield* harness.call("get_studio_task_workflow", { mode: "implement" });
      assert.include(missing.instructions, 'Unavailable linked workspaces: ["mapped"]');
      assert.notInclude(missing.instructions, "/workspace/mapped");
    }).pipe(Effect.provide(NodeSqliteClient.layer({ filename: ":memory:" }))),
);

it.effect(
  "includes verified child checkouts and reports missing links without exposing unrelated paths",
  () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped().pipe(Effect.flatMap(fs.realPath));
      const child = path.join(root, "culture-queer");
      yield* fs.makeDirectory(path.join(child, ".git"), { recursive: true });
      const remoteUrl = "https://github.com/company/site";
      const clones: ProjectCloneSnapshot[] = [];
      const harness = yield* makeHarness({
        clones,
        settings: {
          ...DEFAULT_SERVER_SETTINGS,
          clickUpProjectMappings: { "42:list::list": [ProjectId.make("parent")] },
          clickUpRepositoryMappings: {
            "42:list::list": [{ remoteUrl }, { remoteUrl: "https://github.com/company/missing" }],
          },
        },
        projects: [
          {
            id: ProjectId.make("parent"),
            title: "Parent",
            workspaceRoot: root,
            defaultModelSelection: null,
            scripts: [],
            createdAt: "2026-09-28T00:00:00.000Z",
            updatedAt: "2026-09-28T00:00:00.000Z",
          },
        ],
        resolve: (cwd) =>
          Effect.succeed(
            cwd === child
              ? {
                  canonicalKey: "github.com/company/site",
                  rootPath: cwd,
                  locator: { source: "git-remote", remoteName: "origin", remoteUrl },
                }
              : null,
          ),
      });
      const result = yield* harness.call("get_studio_task_workflow", { mode: "implement" });
      assert.include(result.instructions, child);
      assert.include(
        result.instructions,
        'Unavailable repository links: [{"remoteUrl":"https://github.com/company/missing"}]',
      );
      assert.notInclude(
        result.instructions,
        'Unavailable repository links: [{"remoteUrl":"https://github.com/company/site"}',
      );
      for (const phase of ["running", "failed", "cancelled"] as const) {
        clones.splice(0, clones.length, {
          projectId: ProjectId.make("child"),
          remoteUrl,
          destinationPath: child,
          repository: null,
          phase,
          stage: "receiving",
          percent: null,
          detail: null,
          error: null,
          startedAt: "2026-09-28T00:00:00.000Z",
          endedAt: null,
          sequence: 1,
        });
        const unavailable = yield* harness.call("get_studio_task_workflow", { mode: "implement" });
        assert.notInclude(unavailable.instructions, child);
        assert.include(
          unavailable.instructions,
          'Unavailable repository links: [{"remoteUrl":"https://github.com/company/site"}',
        );
      }
      clones[0] = { ...clones[0]!, projectId: ProjectId.make("parent") };
      const unavailableRoot = yield* harness.call("get_studio_task_workflow", {
        mode: "implement",
      });
      assert.notInclude(unavailableRoot.instructions, root);
      assert.include(unavailableRoot.instructions, 'Unavailable linked workspaces: ["parent"]');
    }).pipe(
      Effect.scoped,
      Effect.provide(
        Layer.mergeAll(NodeSqliteClient.layer({ filename: ":memory:" }), NodeServices.layer),
      ),
    ),
);
for (const options of [{ linked: false, contextLinked: false }, { deleted: true }]) {
  it.effect("does not reveal workflow setup without an active linked thread", () =>
    Effect.gen(function* () {
      const harness = yield* makeHarness(options);
      const error = yield* harness
        .call("get_studio_task_workflow", { mode: "implement" })
        .pipe(Effect.flip);
      assert.equal(error._tag, "ClickUpError");
      assert.equal(harness.calls.reads.length, 0);
    }).pipe(Effect.provide(NodeSqliteClient.layer({ filename: ":memory:" }))),
  );
}
