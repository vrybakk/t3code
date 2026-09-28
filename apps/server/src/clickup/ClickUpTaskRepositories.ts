import { ClickUpError, type ClickUpTask } from "@t3tools/contracts";
import {
  resolveClickUpMapping,
  resolveClickUpRepositories,
} from "@t3tools/shared/clickUpProjectMappings";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Stream from "effect/Stream";
import { ProjectCloneTracker } from "../project/ProjectCloneTracker.ts";
import { ProjectionSnapshotQuery } from "../orchestration/Services/ProjectionSnapshotQuery.ts";
import { RepositoryIdentityResolver } from "../project/RepositoryIdentityResolver.ts";
import { ServerSettingsService } from "../serverSettings.ts";
import { findClickUpLocalRepositories } from "./ClickUpLocalRepositories.ts";

export const resolveTaskRepositories = Effect.fn("resolveTaskRepositories")(
  function* (task: ClickUpTask) {
    const settings = yield* (yield* ServerSettingsService).getSettings;
    const snapshots = yield* ProjectionSnapshotQuery;
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
    return { settings, projects, checkouts, resolved, unavailableLocalIds };
  },
  Effect.mapError(
    () => new ClickUpError({ message: "Could not resolve the task's linked repositories." }),
  ),
);
