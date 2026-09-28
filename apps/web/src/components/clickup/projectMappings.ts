import {
  clickUpSourceKey,
  resolveClickUpMapping,
  resolveClickUpRepositories,
  repositoryKey,
  type RepositoryProject,
} from "@t3tools/shared/clickUpProjectMappings";
export {
  clickUpSourceKey,
  resolveClickUpMapping,
  resolveClickUpRepositories,
  repositoryKey,
  type RepositoryProject,
};
import type { ClickUpTaskSource } from "@t3tools/contracts";

export function githubRepositoryName(remoteUrl: string): string | null {
  const match =
    /^(?:https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)([\w.-]+\/[\w.-]+?)(?:\.git)?\/?$/i.exec(
      remoteUrl.trim(),
    );
  return match?.[1] ?? null;
}

export function savedGithubRepositoryUrl(remoteUrl: string): string | null {
  const url = `https://${repositoryKey(remoteUrl)}`;
  return githubRepositoryName(url) ? url : null;
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
