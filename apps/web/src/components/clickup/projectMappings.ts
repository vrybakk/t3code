import type { ClickUpTask, ClickUpTaskSource, ProjectId } from "@t3tools/contracts";

export function clickUpSourceKey(workspaceId: string, source: ClickUpTaskSource): string {
  return `${workspaceId}:${source.kind}:${source.fieldId ?? ""}:${source.id}`;
}

export function resolveClickUpMapping(
  task: ClickUpTask,
  mappings: Readonly<Record<string, ReadonlyArray<ProjectId>>>,
) {
  for (const kind of ["project", "list", "folder", "space"] as const) {
    const sources = (task.sources ?? []).filter(
      (source) =>
        source.kind === kind && mappings[clickUpSourceKey(task.workspaceId, source)] !== undefined,
    );
    if (sources.length)
      return {
        sources,
        projectIds: [
          ...new Set(
            sources.flatMap((source) => mappings[clickUpSourceKey(task.workspaceId, source)] ?? []),
          ),
        ],
      };
  }
  return null;
}
