import type { EnvironmentProject } from "@t3tools/client-runtime/state/shell";
import type { WorkTrackingProject } from "@t3tools/contracts";

export const workPathName = (path: string) =>
  path
    .replace(/[\\/]+$/u, "")
    .split(/[\\/]/u)
    .at(-1) || path;

export function workProjectLabels(
  projects: ReadonlyArray<WorkTrackingProject>,
  sources: ReadonlyArray<Pick<EnvironmentProject, "id" | "workspaceRoot">>,
): ReadonlyArray<WorkTrackingProject> {
  const roots = new Map(sources.map((source) => [source.id, source.workspaceRoot]));
  return projects.map((project) => {
    const duplicates = projects.filter((other) => other.name === project.name);
    if (duplicates.length < 2) return project;
    const pathFor = (item: WorkTrackingProject) =>
      item.t3ProjectIds.map((id) => roots.get(id)).find(Boolean) ?? item.repositories[0]?.localRoot;
    const path = pathFor(project);
    if (!path) return { ...project, name: `${project.name} · ${project.id.slice(0, 8)}` };
    if (duplicates.some((other) => other.id !== project.id && pathFor(other) === path)) {
      return { ...project, name: `${project.name} · ${project.id.slice(0, 8)}` };
    }
    const parts = path.split(/[\\/]/u).filter(Boolean);
    let suffix = parts.at(-1) ?? path;
    for (let length = 2; length <= parts.length; length += 1) {
      suffix = parts.slice(-length).join("/");
      if (duplicates.every((other) => other.id === project.id || !pathFor(other)?.endsWith(suffix)))
        break;
    }
    return { ...project, name: `${project.name} · ${suffix}` };
  });
}
