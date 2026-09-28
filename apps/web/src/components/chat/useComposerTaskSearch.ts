import type { EnvironmentId } from "@t3tools/contracts";
import { useDebouncedValue } from "../../state/queries";
import { useEnvironmentQuery } from "../../state/query";
import { serverEnvironment } from "../../state/server";

export function useComposerTaskSearch(
  environmentId: EnvironmentId,
  query: string | null,
  supported: boolean,
  preferredWorkspaceId?: string,
) {
  const active = query !== null && supported;
  const connection = useEnvironmentQuery(
    active ? serverEnvironment.clickUpConnection({ environmentId, input: {} }) : null,
  );
  const account = connection.data;
  const workspaceId =
    account?.workspaces.find((workspace) => workspace.id === preferredWorkspaceId)?.id ??
    account?.workspaces[0]?.id;
  const userId = account?.user?.id;
  const settledQuery = useDebouncedValue(query, 250);
  const ready =
    active && query === settledQuery && workspaceId !== undefined && userId !== undefined;
  const sprints = useEnvironmentQuery(
    ready && !query
      ? serverEnvironment.clickUpSprints({ environmentId, input: { workspaceId, userId } })
      : null,
  );
  const sprintId = sprints.data?.activeSprintId;
  const tasks = useEnvironmentQuery(
    ready && (query || sprintId)
      ? serverEnvironment.clickUpTasks({
          environmentId,
          input: {
            workspaceId,
            userId,
            page: 0,
            ...(query ? { query } : { listId: sprintId!, showAll: true }),
          },
        })
      : null,
  );
  const error = connection.error ?? sprints.error ?? tasks.error;
  return {
    label: query
      ? tasks.data?.hasMore
        ? "Workspace tasks · first 50 matches, keep typing to narrow"
        : "Workspace tasks"
      : "Current sprint",
    tasks: ready ? (tasks.data?.tasks ?? []) : [],
    isLoading:
      active &&
      (connection.isPending || sprints.isPending || tasks.isPending || query !== settledQuery),
    emptyState: !supported
      ? "Update this environment to attach tasks in the composer."
      : (error ??
        (!account?.user
          ? "Connect ClickUp in Settings to attach a task."
          : !workspaceId
            ? "No accessible ClickUp workspace."
            : query
              ? "No matching workspace tasks."
              : !sprintId
                ? "No current sprint. Type to search workspace tasks."
                : "No tasks in the current sprint.")),
  };
}
