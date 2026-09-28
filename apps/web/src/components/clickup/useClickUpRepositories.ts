import type { ClickUpTask, EnvironmentId } from "@t3tools/contracts";
import { useEnvironmentSettings } from "../../hooks/useSettings";
import { useProjects } from "../../state/entities";
import { useEnvironmentProjectClones } from "../../state/projectClones";
import { resolveClickUpMapping, resolveClickUpRepositories } from "./projectMappings";

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
  const resolved = resolveClickUpRepositories(mapping, projects);
  const boundIds = new Set(
    mapping?.repositories.flatMap((link) => (link.projectId ? [link.projectId] : [])) ?? [],
  );
  const unavailableLocalIds = (mapping?.projectIds ?? []).filter(
    (id) => !boundIds.has(id) && !projects.some((project) => project.id === id),
  );
  return {
    mapping,
    mappedProjects: resolved.projects,
    missing: resolved.missing,
    repositories,
    allProjects: projects,
    unavailableLocalIds,
  };
}
