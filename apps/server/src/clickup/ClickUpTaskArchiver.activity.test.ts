import { CommandId, EventId, MessageId } from "@t3tools/contracts";
import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { make } from "./ClickUpTaskArchiver.ts";
import { NOW, fixture, setup, threadId } from "./ClickUpTaskArchiver.test-fixtures.ts";

for (const activity of ["running", "starting", "approval", "question", "queued"] as const) {
  it.effect(`keeps ${activity} work visible and rejects automatic commands`, () => {
    const test = fixture();
    return Effect.gen(function* () {
      const { engine, read } = yield* setup;
      if (activity === "running" || activity === "starting") {
        yield* engine.dispatch({
          type: "thread.session.set",
          commandId: CommandId.make("session"),
          threadId,
          createdAt: NOW,
          session: {
            threadId,
            status: activity,
            providerName: "codex",
            runtimeMode: "full-access",
            activeTurnId: null,
            lastError: null,
            updatedAt: NOW,
          },
        });
      } else if (activity === "queued") {
        yield* engine.dispatch({
          type: "thread.message.user.append",
          commandId: CommandId.make("message"),
          threadId,
          createdAt: NOW,
          message: { messageId: MessageId.make("message"), text: "Continue", attachments: [] },
        });
      } else {
        yield* engine.dispatch({
          type: "thread.activity.append",
          commandId: CommandId.make("pending"),
          threadId,
          createdAt: NOW,
          activity: {
            id: EventId.make("pending"),
            kind: activity === "approval" ? "approval.requested" : "user-input.requested",
            summary: "Pending",
            turnId: null,
            tone: "info",
            createdAt: NOW,
            payload: { requestId: "request", responseMode: "message" },
          },
        });
      }
      const sweep = yield* make;
      yield* sweep();
      expect(test.state.reads).toBe(0);
      expect(
        (yield* Effect.result(
          engine.dispatch({
            type: "thread.task.auto-archive",
            commandId: CommandId.make("force-auto"),
            threadId,
            snapshotSequence: yield* engine.latestSequence,
            workspaceId: "42",
            taskId: "task",
          }),
        ))._tag,
      ).toBe("Failure");
      expect((yield* read).archivedAt).toBeNull();
      if (activity === "running" || activity === "starting") {
        yield* engine.dispatch({
          type: "thread.session.set",
          commandId: CommandId.make("idle"),
          threadId,
          createdAt: NOW,
          session: {
            threadId,
            status: "ready",
            providerName: "codex",
            runtimeMode: "full-access",
            activeTurnId: null,
            lastError: null,
            updatedAt: NOW,
          },
        });
        yield* sweep();
        expect((yield* read).archivedAt).toBe(NOW);
      }
    }).pipe(Effect.provide(test.layer));
  });
}
