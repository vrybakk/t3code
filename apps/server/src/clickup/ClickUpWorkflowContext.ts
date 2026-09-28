import { ClickUpError, type ClickUpTask, type ThreadId } from "@t3tools/contracts";
import {
  resolveClickUpMapping,
  resolveClickUpRepositories,
} from "@t3tools/shared/clickUpProjectMappings";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import { ProjectCloneTracker } from "../project/ProjectCloneTracker.ts";
import { ProjectionSnapshotQuery } from "../orchestration/Services/ProjectionSnapshotQuery.ts";
import { RepositoryIdentityResolver } from "../project/RepositoryIdentityResolver.ts";
import { ServerSettingsService } from "../serverSettings.ts";
import { findClickUpLocalRepositories } from "./ClickUpLocalRepositories.ts";

const isClickUpError = Schema.is(ClickUpError);
const encodeContext = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown));

export const readClickUpWorkflowContext = Effect.fn("readClickUpWorkflowContext")(
  function* (task: ClickUpTask, threadId: ThreadId) {
    const settings = yield* (yield* ServerSettingsService).getSettings;
    const snapshots = yield* ProjectionSnapshotQuery;
    const thread = yield* snapshots.getThreadRuntimeContext(threadId);
    if (Option.isNone(thread))
      return yield* new ClickUpError({ message: "This thread is no longer available." });
    const clones = Option.getOrElse(
      yield* Stream.runHead((yield* ProjectCloneTracker).stream),
      () => [],
    );
    const projects = (yield* snapshots.getProjectShells()).filter(
      (project) =>
        !clones.some((clone) => clone.projectId === project.id && clone.phase !== "done"),
    );
    const mapping = resolveClickUpMapping(
      task,
      settings.clickUpProjectMappings,
      settings.clickUpRepositoryMappings,
    );
    const roots = projects.filter(
      (project) =>
        !project.repositoryIdentity &&
        (mapping?.projectIds.includes(project.id) ||
          mapping?.repositories.some((link) => link.projectId === project.id)),
    );
    const discovered = mapping?.repositories.length
      ? yield* findClickUpLocalRepositories(
          roots,
          mapping.repositories.map((link) => link.remoteUrl),
          yield* RepositoryIdentityResolver,
        )
      : [];
    const checkouts = discovered.filter(
      (checkout) =>
        !clones.some(
          (clone) =>
            clone.phase !== "done" &&
            (clone.projectId === checkout.projectId || clone.destinationPath === checkout.cwd),
        ),
    );
    const boundIds = new Set(
      mapping?.repositories.flatMap((link) => (link.projectId ? [link.projectId] : [])) ?? [],
    );
    const unavailableLocalIds = (mapping?.projectIds ?? []).filter(
      (id) => !boundIds.has(id) && !projects.some((project) => project.id === id),
    );
    const resolved = resolveClickUpRepositories(mapping, projects, checkouts);
    const selected = projects.find((project) => project.id === thread.value.projectId);
    const candidates = [
      ...new Map(
        [...resolved.projects, ...(selected ? [selected] : [])].map((project) => [
          project.id,
          project,
        ]),
      ).values(),
    ];
    return [
      "## Current task setup",
      "These are developer settings and repository candidates, not permission to change unrelated code.",
      `Workflow models (null inherits the lead model): ${encodeContext({ research: settings.clickUpWorkflowModels.research, review: settings.clickUpWorkflowModels.review })}`,
      "Implementation uses this thread's selected model and effort.",
      `Repository candidates: ${encodeContext(
        candidates.flatMap((project) => [
          { id: project.id, title: project.title, cwd: project.workspaceRoot },
          ...checkouts
            .filter(
              (checkout) =>
                checkout.projectId === project.id && checkout.cwd !== project.workspaceRoot,
            )
            .map((checkout) => ({ id: project.id, cwd: checkout.cwd })),
        ]),
      )}`,
      ...(unavailableLocalIds.length
        ? [
            `Unavailable linked workspaces: ${encodeContext(unavailableLocalIds)}. Ask the developer to restore these before implementation.`,
          ]
        : []),
      ...(resolved.missing.length
        ? [
            `Unavailable repository links: ${encodeContext(resolved.missing)}. Ask the developer to correct these before implementation.`,
          ]
        : []),
    ].join("\n");
  },
  Effect.mapError((error) =>
    isClickUpError(error)
      ? error
      : new ClickUpError({
          message: "Could not load this task's workflow settings and repositories.",
        }),
  ),
);
