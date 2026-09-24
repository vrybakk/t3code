import { normalizeGitRemoteUrl } from "@t3tools/shared/git";
import type {
  ClickUpRepositoryLink,
  ClickUpTask,
  ClickUpTaskSource,
  ProjectId,
  RepositoryIdentity,
} from "@t3tools/contracts";

export function clickUpSourceKey(workspaceId: string, source: ClickUpTaskSource): string {
  return `${workspaceId}:${source.kind}:${source.fieldId ?? ""}:${source.id}`;
}

export function resolveClickUpMapping(
  task: ClickUpTask,
  mappings: Readonly<Record<string, ReadonlyArray<ProjectId>>>,
  repositories: Readonly<Record<string, ReadonlyArray<ClickUpRepositoryLink>>> = {},
) {
  for (const kind of ["project", "list", "folder", "space"] as const) {
    const sources = (task.sources ?? []).filter(
      (source) =>
        source.kind === kind &&
        (mappings[clickUpSourceKey(task.workspaceId, source)] !== undefined ||
          repositories[clickUpSourceKey(task.workspaceId, source)] !== undefined),
    );
    if (sources.length)
      return {
        sources,
        repositories: sources.flatMap(
          (source) => repositories[clickUpSourceKey(task.workspaceId, source)] ?? [],
        ),
        projectIds: [
          ...new Set(
            sources.flatMap((source) => mappings[clickUpSourceKey(task.workspaceId, source)] ?? []),
          ),
        ],
      };
  }
  return null;
}

export function githubRepositoryName(remoteUrl: string): string | null {
  const match =
    /^(?:https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)([\w.-]+\/[\w.-]+?)(?:\.git)?\/?$/i.exec(
      remoteUrl.trim(),
    );
  return match?.[1] ?? null;
}

export function repositoryKey(remoteUrl: string): string {
  return normalizeGitRemoteUrl(remoteUrl);
}

export function savedGithubRepositoryUrl(remoteUrl: string): string | null {
  const url = `https://${repositoryKey(remoteUrl)}`;
  return githubRepositoryName(url) ? url : null;
}

interface RepositoryProject {
  id: ProjectId;
  title: string;
  repositoryIdentity?: RepositoryIdentity | null | undefined;
}

export function resolveClickUpRepositories<T extends RepositoryProject>(
  mapping: ReturnType<typeof resolveClickUpMapping>,
  projects: ReadonlyArray<T>,
) {
  const boundIds = new Set(
    mapping?.repositories.flatMap((link) => (link.projectId ? [link.projectId] : [])) ?? [],
  );
  const local = projects.filter(
    (project) => mapping?.projectIds.includes(project.id) && !boundIds.has(project.id),
  );
  const missing: ClickUpRepositoryLink[] = [];
  for (const repository of mapping?.repositories ?? []) {
    const matches = projects.filter(
      (project) =>
        project.repositoryIdentity &&
        repositoryKey(project.repositoryIdentity.locator.remoteUrl) ===
          repositoryKey(repository.remoteUrl),
    );
    const project =
      matches.find((candidate) => candidate.id === repository.projectId) ?? matches[0];
    if (project) local.push(project);
    else missing.push(repository);
  }
  return {
    projects: [...new Map(local.map((project) => [project.id, project])).values()],
    missing: [
      ...new Map(
        missing.map((repository) => [repositoryKey(repository.remoteUrl), repository]),
      ).values(),
    ],
  };
}

export function suggestClickUpRepository<T extends RepositoryProject>(
  source: ClickUpTaskSource | undefined,
  projects: ReadonlyArray<T>,
): T | null {
  if (!source) return null;
  const name = source.name.trim().toLowerCase();
  const matches = projects.filter((project) =>
    [project.title, project.repositoryIdentity?.name].some(
      (candidate) => candidate?.trim().toLowerCase() === name,
    ),
  );
  return matches.length === 1 ? matches[0]! : null;
}
