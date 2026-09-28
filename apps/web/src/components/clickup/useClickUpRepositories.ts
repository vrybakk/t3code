import { useAtomValue } from "@effect/atom-react";
import * as Option from "effect/Option";
import { Atom, AsyncResult } from "effect/unstable/reactivity";
import type { ClickUpLocalRepository, ClickUpTask, EnvironmentId } from "@t3tools/contracts";
import { useEnvironmentSettings } from "../../hooks/useSettings";
import { appAtomRegistry } from "../../rpc/atomRegistry";
import { serverEnvironment } from "../../state/server";
import { useProjects, useServerConfigs } from "../../state/entities";
import { useEnvironmentProjectClones } from "../../state/projectClones";
import { resolveClickUpMapping, resolveClickUpRepositories } from "./projectMappings";

const inactiveCheckouts = Atom.make(AsyncResult.initial<ReadonlyArray<ClickUpLocalRepository>>());

export function useClickUpRepositories(task: ClickUpTask, environmentId: EnvironmentId) {
  const mappings = useEnvironmentSettings(
    environmentId,
    (settings) => settings.clickUpProjectMappings,
  );
  const repositories = useEnvironmentSettings(
    environmentId,
    (settings) => settings.clickUpRepositoryMappings,
  );
  const allProjects = useProjects().filter((project) => project.environmentId === environmentId);
  const clones = useEnvironmentProjectClones(environmentId);
  const projects = allProjects.filter(
    (project) => !clones.some((clone) => clone.projectId === project.id && clone.phase !== "done"),
  );
  const mapping = resolveClickUpMapping(task, mappings, repositories);
  const supportsDiscovery =
    useServerConfigs().get(environmentId)?.environment.capabilities.clickUpLocalRepositories ===
    true;
  const roots = projects.filter(
    (project) =>
      !project.repositoryIdentity &&
      (mapping?.projectIds.includes(project.id) ||
        mapping?.repositories.some((link) => link.projectId === project.id)),
  );
  const needsDiscovery =
    supportsDiscovery && roots.length > 0 && (mapping?.repositories.length ?? 0) > 0;
  const checkoutQuery = needsDiscovery
    ? serverEnvironment.clickUpLocalRepositories({
        environmentId,
        input: {
          projectIds: roots.map((project) => project.id),
          remoteUrls: mapping!.repositories.map((link) => link.remoteUrl),
        },
      })
    : inactiveCheckouts;
  const checkoutResult = useAtomValue(checkoutQuery);
  const localCheckouts = (Option.getOrNull(AsyncResult.value(checkoutResult)) ?? []).filter(
    (checkout) =>
      !clones.some(
        (clone) =>
          clone.phase !== "done" &&
          (clone.projectId === checkout.projectId || clone.destinationPath === checkout.cwd),
      ),
  );
  const resolved = resolveClickUpRepositories(mapping, projects, localCheckouts);
  const boundIds = new Set(
    mapping?.repositories.flatMap((link) => (link.projectId ? [link.projectId] : [])) ?? [],
  );
  const unavailableLocalIds = (mapping?.projectIds ?? []).filter(
    (id) => !boundIds.has(id) && !projects.some((project) => project.id === id),
  );
  return {
    mapping,
    localCheckouts,
    checking: needsDiscovery && AsyncResult.isInitial(checkoutResult),
    discoveryFailed: needsDiscovery && AsyncResult.isFailure(checkoutResult),
    retryDiscovery: () => appAtomRegistry.refresh(checkoutQuery),
    mappedProjects: resolved.projects,
    missing: resolved.missing,
    repositories,
    allProjects: projects,
    unavailableLocalIds,
  };
}
