import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";
import {
  CommandId,
  ComposerContextId,
  EventId,
  MessageId,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import { decideOrchestrationCommand } from "./decider.ts";
import { createEmptyReadModel, projectEvent } from "./projector.ts";

const createdAt = "2026-08-24T10:00:00.000Z";
const projectId = ProjectId.make("project-1");
const threadId = ThreadId.make("thread-bootstrap");
const messageId = MessageId.make("message-bootstrap");

const readModelWithThread = Effect.gen(function* () {
  const withProject = yield* projectEvent(createEmptyReadModel(createdAt), {
    sequence: 1,
    eventId: EventId.make("event-project-created"),
    aggregateKind: "project",
    aggregateId: projectId,
    type: "project.created",
    occurredAt: createdAt,
    commandId: CommandId.make("command-project-created"),
    causationEventId: null,
    correlationId: CommandId.make("command-project-created"),
    metadata: {},
    payload: {
      projectId,
      title: "Project",
      workspaceRoot: "/tmp/project",
      defaultModelSelection: null,
      scripts: [],
      createdAt,
      updatedAt: createdAt,
    },
  });
  return yield* projectEvent(withProject, {
    sequence: 2,
    eventId: EventId.make("event-thread-created"),
    aggregateKind: "thread",
    aggregateId: threadId,
    type: "thread.created",
    occurredAt: createdAt,
    commandId: CommandId.make("command-thread-created"),
    causationEventId: null,
    correlationId: CommandId.make("command-thread-created"),
    metadata: {},
    payload: {
      threadId,
      projectId,
      title: "Bootstrap thread",
      modelSelection: { instanceId: ProviderInstanceId.make("codex"), model: "gpt-5" },
      runtimeMode: "full-access",
      interactionMode: "default",
      branch: null,
      worktreePath: null,
      createdAt,
      updatedAt: createdAt,
    },
  });
});

const appendCommand = {
  type: "thread.message.user.append" as const,
  commandId: CommandId.make("command-append"),
  threadId,
  message: { messageId, text: "Build it", attachments: [] },
  createdAt,
};

const turnStartCommand = {
  type: "thread.turn.start" as const,
  commandId: CommandId.make("command-turn-start"),
  threadId,
  message: { messageId, role: "user" as const, text: "Build it", attachments: [] },
  runtimeMode: "full-access" as const,
  interactionMode: "default" as const,
  createdAt,
};

it.layer(NodeServices.layer)("thread.message.user.append", (it) => {
  it.effect(
    "links task context before deferred work and keeps persisted context authoritative",
    () =>
      Effect.gen(function* () {
        const initial = yield* readModelWithThread;
        const task = {
          version: 1 as const,
          kind: "task" as const,
          contextId: ComposerContextId.make("task_a"),
          label: "Task A",
          name: "Task A",
          workspaceId: "42",
          taskId: "a",
        };
        const message = {
          ...appendCommand.message,
          text: "Discuss [Task A](t3-context://v1/task/task_a)",
          context: { version: 1 as const, records: [task] },
        };
        const planned = yield* decideOrchestrationCommand({
          command: { ...appendCommand, message },
          readModel: initial,
        });
        const events = Array.isArray(planned) ? planned : [planned];
        expect(events.map((event) => event.type)).toEqual([
          "thread.task-linked",
          "thread.message-sent",
        ]);
        expect(events[0]?.payload).toMatchObject({
          link: { workspaceId: "42", taskId: "a", primary: true },
        });
        let projected = initial;
        for (const [index, event] of events.entries())
          projected = yield* projectEvent(projected, { ...event, sequence: 3 + index });
        const started = yield* decideOrchestrationCommand({
          command: {
            ...turnStartCommand,
            message: {
              ...turnStartCommand.message,
              text: "[Other](t3-context://v1/task/task_b)",
              context: {
                version: 1,
                records: [{ ...task, contextId: ComposerContextId.make("task_b"), taskId: "b" }],
              },
            },
          },
          readModel: projected,
        });
        expect((Array.isArray(started) ? started : [started]).map((event) => event.type)).toEqual([
          "thread.turn-start-requested",
        ]);
        const followup = yield* decideOrchestrationCommand({
          command: {
            ...turnStartCommand,
            message: {
              ...turnStartCommand.message,
              messageId: MessageId.make("followup"),
              text: "[Other](t3-context://v1/task/task_b)",
              context: {
                version: 1,
                records: [{ ...task, contextId: ComposerContextId.make("task_b"), taskId: "b" }],
              },
            },
          },
          readModel: projected,
        });
        const followupEvents = Array.isArray(followup) ? followup : [followup];
        expect(followupEvents[0]?.payload).toMatchObject({ link: { taskId: "b", primary: false } });
      }),
  );

  it.effect("persists a user message without a turn, tagged as deferred", () =>
    Effect.gen(function* () {
      const readModel = yield* readModelWithThread;
      const planned = yield* decideOrchestrationCommand({ command: appendCommand, readModel });
      const events = Array.isArray(planned) ? planned : [planned];
      expect(events.map((event) => event.type)).toEqual(["thread.message-sent"]);
      expect(events[0]?.metadata.deferredTurn).toBe(true);
      expect(events[0]?.payload).toMatchObject({ messageId, role: "user", turnId: null });
    }),
  );

  it.effect("rejects a message id that already exists on the thread", () =>
    Effect.gen(function* () {
      const readModel = yield* readModelWithThread;
      const first = yield* decideOrchestrationCommand({ command: appendCommand, readModel });
      const firstEvent = Array.isArray(first) ? first[0]! : first;
      const withMessage = yield* projectEvent(readModel, { ...firstEvent, sequence: 3 });
      const error = yield* Effect.flip(
        decideOrchestrationCommand({ command: appendCommand, readModel: withMessage }),
      );
      expect(error._tag).toBe("OrchestrationCommandInvariantError");
      expect(error.message).toContain("already exists");
    }),
  );

  it.effect("lets the following turn start reference the message instead of re-sending it", () =>
    Effect.gen(function* () {
      const readModel = yield* readModelWithThread;
      const appended = yield* decideOrchestrationCommand({ command: appendCommand, readModel });
      const appendedEvent = Array.isArray(appended) ? appended[0]! : appended;
      const withMessage = yield* projectEvent(readModel, { ...appendedEvent, sequence: 3 });

      const planned = yield* decideOrchestrationCommand({
        command: turnStartCommand,
        readModel: withMessage,
      });
      const events = Array.isArray(planned) ? planned : [planned];
      expect(events.map((event) => event.type)).toEqual(["thread.turn-start-requested"]);
      expect(events[0]?.payload).toMatchObject({ messageId });

      // Without the append the turn start still carries the message itself.
      const direct = yield* decideOrchestrationCommand({ command: turnStartCommand, readModel });
      const directEvents = Array.isArray(direct) ? direct : [direct];
      expect(directEvents.map((event) => event.type)).toEqual([
        "thread.message-sent",
        "thread.turn-start-requested",
      ]);
    }),
  );
});
