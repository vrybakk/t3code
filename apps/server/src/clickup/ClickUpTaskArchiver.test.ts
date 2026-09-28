import {
  ClickUpError,
  CommandId,
  ClientOrchestrationCommand,
  ThreadId,
  ProjectId,
  ProviderInstanceId,
} from "@t3tools/contracts";
import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { TestClock } from "effect/testing";
import { ThreadBackgroundLivenessService } from "../orchestration/ThreadBackgroundLiveness.ts";
import { make } from "./ClickUpTaskArchiver.ts";
import {
  CLOSED,
  CREATED,
  NOW,
  fixture,
  setup,
  task,
  threadId,
} from "./ClickUpTaskArchiver.test-fixtures.ts";

const isClientCommand = Schema.is(ClientOrchestrationCommand);

it.effect(
  "archives a completed single-task thread, preserves history and honors a durable manual reopen",
  () => {
    const test = fixture();
    return Effect.gen(function* () {
      const { engine, snapshots, read } = yield* setup;
      const sweep = yield* make;
      yield* sweep();
      expect((yield* read).archivedAt).toBe(NOW);
      expect((yield* read).clickUpTasks).toHaveLength(1);
      expect((yield* snapshots.getArchivedShellSnapshot()).threads).toHaveLength(1);
      yield* engine.dispatch({
        type: "thread.unarchive",
        commandId: CommandId.make("reopen"),
        threadId,
      });
      // A fresh archiver instance must read the persisted reopen, not an in-memory skip list.
      const restarted = yield* make;
      yield* restarted();
      expect((yield* read).archivedAt).toBeNull();
      test.state.response = {
        id: "task",
        team_id: "42",
        status: { type: "closed" },
        date_closed: String(Date.parse(NOW) + 1_000),
      };
      yield* TestClock.adjust("2 seconds");
      yield* restarted();
      expect((yield* read).archivedAt).not.toBeNull();
    }).pipe(Effect.provide(test.layer));
  },
);

for (const [name, response] of [
  ["Done remains open", { status: { type: "done" } }],
  ["QA remains open", { status: { type: "custom" } }],
  ["missing closed date", { date_closed: null }],
  ["invalid closed date", { date_closed: "invalid" }],
  ["historic completion", { date_closed: String(Date.parse(CREATED) - 1) }],
  ["workspace mismatch", { team_id: "other" }],
  ["task mismatch", { id: "other" }],
  ["unexpected response", { status: {} }],
] as const) {
  it.effect(`keeps thread visible: ${name}`, () => {
    const test = fixture();
    test.state.response = {
      id: "task",
      team_id: "42",
      status: { type: "closed" },
      date_closed: String(Date.parse(CLOSED)),
      ...response,
    };
    return Effect.gen(function* () {
      const { read } = yield* setup;
      const sweep = yield* make;
      yield* sweep().pipe(Effect.ignore);
      expect((yield* read).archivedAt).toBeNull();
    }).pipe(Effect.provide(test.layer));
  });
}

it.effect("does not fetch while disconnected, and leaves multi-task threads untouched", () => {
  const test = fixture();
  return Effect.gen(function* () {
    const { engine, read } = yield* setup;
    const sweep = yield* make;
    test.state.connected = false;
    yield* sweep();
    expect(test.state.reads).toBe(0);
    test.state.connected = true;
    yield* engine.dispatch({
      type: "thread.task.link",
      commandId: CommandId.make("second"),
      threadId,
      task: { ...task, taskId: "second" },
    });
    yield* sweep();
    expect(test.state.reads).toBe(0);
    expect((yield* read).archivedAt).toBeNull();
  }).pipe(Effect.provide(test.layer));
});

it.effect("defers live background work until idle", () => {
  const test = fixture();
  return Effect.gen(function* () {
    const { read } = yield* setup;
    const liveness = yield* ThreadBackgroundLivenessService;
    const sweep = yield* make;
    liveness.recordTaskLiveness({
      threadId,
      taskId: "agent",
      taskType: "subagent",
      kind: "started",
      status: undefined,
    });
    yield* sweep();
    expect((yield* read).archivedAt).toBeNull();
    expect(test.state.reads).toBe(0);
    liveness.clearThreadLiveness(threadId);
    yield* sweep();
    expect((yield* read).archivedAt).toBe(NOW);
  }).pipe(Effect.provide(test.layer));
});

for (const race of ["second-task", "background-work", "account-change", "manual-reopen"] as const) {
  it.effect(`rejects changes during task lookup: ${race}`, () => {
    const test = fixture();
    return Effect.gen(function* () {
      const { engine, read } = yield* setup;
      const liveness = yield* ThreadBackgroundLivenessService;
      test.state.beforeRead = Effect.gen(function* () {
        if (race === "second-task")
          yield* engine
            .dispatch({
              type: "thread.task.link",
              commandId: CommandId.make("race-link"),
              threadId,
              task: { ...task, taskId: "second" },
            })
            .pipe(Effect.orDie);
        if (race === "background-work")
          liveness.recordTaskLiveness({
            threadId,
            taskId: "agent",
            taskType: "subagent",
            kind: "started",
            status: undefined,
          });
        if (race === "account-change") test.state.token = "different-account";
        if (race === "manual-reopen") {
          yield* engine
            .dispatch({
              type: "thread.archive",
              commandId: CommandId.make("race-archive"),
              threadId,
            })
            .pipe(Effect.orDie);
          yield* engine
            .dispatch({
              type: "thread.unarchive",
              commandId: CommandId.make("race-reopen"),
              threadId,
            })
            .pipe(Effect.orDie);
        }
      });
      const sweep = yield* make;
      yield* sweep();
      expect((yield* read).archivedAt).toBeNull();
    }).pipe(Effect.provide(test.layer));
  });
}

it.effect(
  "rejects auto-archive for an unlinked or multi-task thread even with a fresh snapshot",
  () => {
    const test = fixture();
    return Effect.gen(function* () {
      const { engine, read } = yield* setup;
      yield* engine.dispatch({
        type: "thread.task.link",
        commandId: CommandId.make("extra"),
        threadId,
        task: { ...task, taskId: "extra" },
      });
      const command = {
        type: "thread.task.auto-archive" as const,
        commandId: CommandId.make("bad-auto"),
        threadId,
        snapshotSequence: yield* engine.latestSequence,
        workspaceId: "42",
        taskId: "task",
      };
      expect(isClientCommand(command)).toBe(false);
      expect((yield* Effect.result(engine.dispatch(command)))._tag).toBe("Failure");
      expect((yield* read).archivedAt).toBeNull();
    }).pipe(Effect.provide(test.layer));
  },
);

it.effect("an inaccessible task does not prevent another thread from archiving", () => {
  const test = fixture();
  return Effect.gen(function* () {
    const { engine, snapshots } = yield* setup;
    test.state.responses.set(
      "task/task",
      new ClickUpError({ message: "ClickUp request failed (404)." }),
    );
    const secondId = ThreadId.make("second");
    yield* engine.dispatch({
      type: "thread.create",
      commandId: CommandId.make("second"),
      threadId: secondId,
      projectId: ProjectId.make("project"),
      title: "Second",
      modelSelection: { instanceId: ProviderInstanceId.make("codex"), model: "gpt-5" },
      runtimeMode: "full-access",
      interactionMode: "default",
      branch: null,
      worktreePath: null,
      createdAt: CREATED,
      clickUpTask: { ...task, taskId: "second" },
    });
    test.state.responses.set("task/second", {
      id: "second",
      team_id: "42",
      status: { type: "closed" },
      date_closed: String(Date.parse(CLOSED)),
    });
    const sweep = yield* make;
    yield* sweep();
    expect(test.state.reads).toBe(2);
    expect(
      (yield* snapshots.getArchivedShellSnapshot()).threads.map((thread) => thread.id),
    ).toEqual([secondId]);
  }).pipe(Effect.provide(test.layer));
});

it.effect("linking an already closed task to an existing custom thread keeps it visible", () => {
  const test = fixture();
  return Effect.gen(function* () {
    const { engine, snapshots } = yield* setup;
    const customId = ThreadId.make("custom");
    yield* engine.dispatch({
      type: "thread.create",
      commandId: CommandId.make("custom"),
      threadId: customId,
      projectId: ProjectId.make("project"),
      title: "Custom",
      modelSelection: { instanceId: ProviderInstanceId.make("codex"), model: "gpt-5" },
      runtimeMode: "full-access",
      interactionMode: "default",
      branch: null,
      worktreePath: null,
      createdAt: CREATED,
    });
    const sweep = yield* make;
    yield* engine.dispatch({
      type: "thread.task.link",
      commandId: CommandId.make("historic-link"),
      threadId: customId,
      task,
    });
    yield* sweep();
    expect((yield* snapshots.getShellSnapshot()).threads.map((thread) => thread.id)).toContain(
      customId,
    );
  }).pipe(Effect.provide(test.layer));
});
