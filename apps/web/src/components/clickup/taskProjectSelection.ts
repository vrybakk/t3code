import type { ClickUpTask, EnvironmentId, ProjectId } from "@t3tools/contracts";
import {
  clickUpSourceKey,
  suggestClickUpRepository,
  type RepositoryProject,
} from "./projectMappings";

const sourceKinds = ["project", "list", "folder", "space"] as const;

export function clickUpLaunchProjectStorageKey(task: ClickUpTask, environmentId: EnvironmentId) {
  const sources = sourceKinds
    .map((kind) => (task.sources ?? []).filter((source) => source.kind === kind))
    .find((sources) => sources.length);
  return `t3code:clickup-launch-project:${JSON.stringify([
    environmentId,
    task.workspaceId,
    sources
      ? sources.map((source) => clickUpSourceKey(task.workspaceId, source)).sort()
      : ["task", task.taskId],
  ])}`;
}

export function resolveClickUpLaunchProject<T extends RepositoryProject>(
  task: ClickUpTask,
  projects: ReadonlyArray<T>,
  mappedProjects: ReadonlyArray<T>,
  rememberedProjectId: ProjectId | null,
): T | null {
  const remembered = projects.find((project) => project.id === rememberedProjectId);
  if (remembered) return remembered;
  if (mappedProjects[0]) return mappedProjects[0];
  for (const kind of sourceKinds) {
    for (const source of (task.sources ?? []).filter((source) => source.kind === kind)) {
      const match = suggestClickUpRepository(source, projects);
      if (match) return match;
    }
  }
  return projects[0] ?? null;
}
