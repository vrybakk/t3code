import {
  ClickUpError,
  CommandId,
  MessageId,
  ThreadId,
  ProjectId,
  ProviderInstanceId,
} from "@t3tools/contracts";
import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { TestClock } from "effect/testing";
import { make } from "./ClickUpTaskArchiver.ts";
import {
  CREATED,
  NOW,
  fixture,
  setup,
  task,
  threadId,
} from "./ClickUpTaskArchiver.test-fixtures.ts";

const secondTask = { ...task, taskId: "second" };
const closed = (at = "2026-09-28T11:30:00.000Z") => ({
  id: "second",
  team_id: "42",
  status: { type: "closed" },
  date_closed: String(Date.parse(at)),
});
const setupMultiple = Effect.gen(function* () {
  const context = yield* setup;
  yield* TestClock.setTime(Date.parse("2026-09-28T10:30:00.000Z"));
  yield* context.engine.dispatch({
    type: "thread.task.link",
    commandId: CommandId.make("second-link"),
    threadId,
    task: secondTask,
  });
  yield* TestClock.setTime(Date.parse(NOW));
  return context;
});

it.effect(
  "archives when the last task finishes, and preserves manual reopen until a later completion",
  () => {
    const test = fixture();
    test.state.responses.set("task/second", closed());
    return Effect.gen(function* () {
      const { engine, read } = yield* setupMultiple;
      yield* engine.dispatch({
        type: "thread.message.user.append",
        commandId: CommandId.make("followup"),
        threadId,
        createdAt: "2026-09-28T11:15:00.000Z",
        message: {
          messageId: MessageId.make("followup"),
          text: "Finish the second task",
          attachments: [],
        },
      });
      const sweep = yield* make;
      yield* sweep();
      expect((yield* read).archivedAt).toBe(NOW);
      expect((yield* read).clickUpTasks).toHaveLength(2);
      expect(test.state.reads).toBe(2);
      yield* engine.dispatch({
        type: "thread.unarchive",
        commandId: CommandId.make("reopen"),
        threadId,
      });
      const restarted = yield* make;
      yield* restarted();
      expect((yield* read).archivedAt).toBeNull();
      test.state.responses.set("task/second", closed("2026-09-28T12:01:00.000Z"));
      yield* TestClock.adjust("2 minutes");
      yield* restarted();
      expect((yield* read).archivedAt).not.toBeNull();
    }).pipe(Effect.provide(test.layer));
  },
);

for (const [name, response] of [
  ["open", { ...closed(), status: { type: "custom" } }],
  ["Done", { ...closed(), status: { type: "done" } }],
  ["unknown completion", { ...closed(), date_closed: null }],
  ["inaccessible", new ClickUpError({ message: "ClickUp request failed (403)." })],
  ["wrong workspace", { ...closed(), team_id: "other" }],
] as const) {
  it.effect(`keeps all-task thread visible when one task is ${name}`, () => {
    const test = fixture();
    test.state.responses.set("task/second", response);
    return Effect.gen(function* () {
      const { read } = yield* setupMultiple;
      const sweep = yield* make;
      yield* sweep();
      expect((yield* read).archivedAt).toBeNull();
    }).pipe(Effect.provide(test.layer));
  });
}

it.effect("reads shared tasks only once per sweep", () => {
  const test = fixture();
  test.state.responses.set("task/second", closed());
  return Effect.gen(function* () {
    const { engine, snapshots } = yield* setupMultiple;
    yield* engine.dispatch({
      type: "thread.create",
      commandId: CommandId.make("other-thread"),
      threadId: ThreadId.make("other"),
      projectId: ProjectId.make("project"),
      title: "Other",
      modelSelection: { instanceId: ProviderInstanceId.make("codex"), model: "gpt-5" },
      runtimeMode: "full-access",
      interactionMode: "default",
      branch: null,
      worktreePath: null,
      createdAt: CREATED,
      clickUpTask: task,
    });
    const sweep = yield* make;
    yield* sweep();
    expect(test.state.reads).toBe(2);
    expect((yield* snapshots.getArchivedShellSnapshot()).threads).toHaveLength(2);
  }).pipe(Effect.provide(test.layer));
});

it.effect("does not archive if a task is removed during lookup", () => {
  const test = fixture();
  test.state.responses.set("task/second", closed());
  return Effect.gen(function* () {
    const { engine, read } = yield* setupMultiple;
    test.state.beforeRead = engine
      .dispatch({
        type: "thread.task.unlink",
        commandId: CommandId.make("remove"),
        threadId,
        workspaceId: "42",
        taskId: "second",
      })
      .pipe(Effect.orDie, Effect.asVoid);
    const sweep = yield* make;
    yield* sweep();
    expect((yield* read).archivedAt).toBeNull();
  }).pipe(Effect.provide(test.layer));
});

it.effect("adding a historical completed task does not hide the conversation", () => {
  const test = fixture();
  test.state.responses.set("task/second", closed());
  return Effect.gen(function* () {
    const { engine, read } = yield* setup;
    yield* engine.dispatch({
      type: "thread.task.link",
      commandId: CommandId.make("historic"),
      threadId,
      task: secondTask,
    });
    const sweep = yield* make;
    yield* sweep();
    expect((yield* read).archivedAt).toBeNull();
  }).pipe(Effect.provide(test.layer));
});
