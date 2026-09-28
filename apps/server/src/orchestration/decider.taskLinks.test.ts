import {
  CommandId,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
  type OrchestrationReadModel,
  type ThreadClickUpTaskLink,
} from "@t3tools/contracts";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { decideOrchestrationCommand } from "./decider.ts";
import { projectEvent } from "./projector.ts";
const NOW = "2026-09-28T00:00:00.000Z";
const THREAD_ID = ThreadId.make("thread-1");
function makeReadModel(clickUpTasks: ReadonlyArray<ThreadClickUpTaskLink>): OrchestrationReadModel {
  return {
    snapshotSequence: 0,
    projects: [
      {
        id: ProjectId.make("project-1"),
        title: "Project",
        workspaceRoot: "/repo",
        defaultModelSelection: null,
        scripts: [],
        createdAt: NOW,
        updatedAt: NOW,
        deletedAt: null,
        repositoryIdentity: {
          canonicalKey: "github.com/t3tools/t3code",
          provider: "github",
          displayName: "t3tools/t3code",
          locator: {
            source: "git-remote",
            remoteName: "origin",
            remoteUrl: "https://github.com/t3tools/t3code.git",
          },
        },
      },
    ],
    threads: [
      {
        id: THREAD_ID,
        projectId: ProjectId.make("project-1"),
        title: "Thread",
        modelSelection: { instanceId: ProviderInstanceId.make("codex"), model: "gpt-5.4" },
        runtimeMode: "full-access",
        interactionMode: "default",
        branch: null,
        worktreePath: null,
        pullRequests: [],
        clickUpTasks,
        latestTurn: null,
        createdAt: NOW,
        updatedAt: NOW,
        archivedAt: null,
        settledOverride: null,
        settledAt: null,
        deletedAt: null,
        messages: [],
        proposedPlans: [],
        activities: [],
        checkpoints: [],
        session: null,
      },
    ],
    updatedAt: NOW,
  };
}

const primary = { workspaceId: "42", taskId: "original", name: "Original task", primary: true };
it.layer(NodeServices.layer)("thread task links", (it) => {
  it.effect("adds and removes context while protecting the original task", () =>
    Effect.gen(function* () {
      let model = makeReadModel([primary]);
      const command = {
        type: "thread.task.link" as const,
        commandId: CommandId.make("link"),
        threadId: THREAD_ID,
        task: { workspaceId: "42", taskId: "related", name: "Related task" },
      };
      const result = yield* decideOrchestrationCommand({ readModel: model, command });
      const event = Array.isArray(result) ? result[0]! : result;
      expect(event.type).toBe("thread.task-linked");
      model = yield* projectEvent(model, { ...event, sequence: 1 });
      expect(model.threads[0]?.clickUpTasks).toEqual([
        primary,
        { ...command.task, primary: false },
      ]);
      expect(
        (yield* Effect.result(decideOrchestrationCommand({ readModel: model, command })))._tag,
      ).toBe("Failure");
      const unlink = {
        type: "thread.task.unlink" as const,
        commandId: CommandId.make("unlink"),
        threadId: THREAD_ID,
        workspaceId: "42",
        taskId: "original",
      };
      expect(
        (yield* Effect.result(decideOrchestrationCommand({ readModel: model, command: unlink })))
          ._tag,
      ).toBe("Failure");
      const removed = yield* decideOrchestrationCommand({
        readModel: model,
        command: { ...unlink, taskId: "related" },
      });
      const removal = Array.isArray(removed) ? removed[0]! : removed;
      model = yield* projectEvent(model, { ...removal, sequence: 2 });
      expect(model.threads[0]?.clickUpTasks).toEqual([primary]);
    }),
  );
});
