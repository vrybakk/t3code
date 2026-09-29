import type { ClickUpTask, EnvironmentId } from "@t3tools/contracts";
import { useEffect, useMemo, useRef, useState } from "react";
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
  const ready = active && workspaceId !== undefined && userId !== undefined;
  const sprints = useEnvironmentQuery(
    ready
      ? serverEnvironment.clickUpSprints({ environmentId, input: { workspaceId, userId } })
      : null,
  );
  const sprintId = sprints.data?.activeSprintId;
  const sprintTasks = useEnvironmentQuery(
    ready && sprintId
      ? serverEnvironment.clickUpTasks({
          environmentId,
          input: { workspaceId, userId, page: 0, listId: sprintId, showAll: false },
        })
      : null,
  );
  const normalizedQuery = query?.trim() ?? "";
  const settledQuery = useDebouncedValue(normalizedQuery, 250);
  const searching = ready && normalizedQuery.length > 0;
  const remoteScope = searching
    ? JSON.stringify([environmentId, workspaceId, userId, normalizedQuery])
    : null;
  const [remotePage, setRemotePage] = useState<{
    scope: string;
    page: number;
    tasks: ReadonlyArray<ClickUpTask>;
    hasMore: boolean;
  } | null>(null);
  const saved = remotePage?.scope === remoteScope ? remotePage : null;
  const page = saved?.page ?? 0;
  const remoteReady = searching && normalizedQuery === settledQuery;
  const workspaceTasks = useEnvironmentQuery(
    remoteReady
      ? serverEnvironment.clickUpTasks({
          environmentId,
          input: { workspaceId, userId, page: 0, query: normalizedQuery, searchPage: page },
        })
      : null,
  );
  const remoteData = workspaceTasks.data;
  const refreshWorkspace = workspaceTasks.refresh;
  const processedResponse = useRef<{
    scope: string;
    page: number;
    data: typeof remoteData;
  } | null>(null);
  useEffect(() => {
    if (remoteScope === null) {
      processedResponse.current = null;
    } else if (remoteReady && remoteData && !workspaceTasks.isPending && !workspaceTasks.error) {
      if (
        processedResponse.current?.scope === remoteScope &&
        processedResponse.current.page === page &&
        processedResponse.current.data === remoteData
      )
        return;
      processedResponse.current = { scope: remoteScope, page, data: remoteData };
      const nextPage = remoteData.nextSearchPage ?? page;
      setRemotePage((previous) =>
        previous?.scope === remoteScope &&
        previous.page === nextPage &&
        previous.tasks === remoteData.tasks &&
        previous.hasMore === remoteData.hasMore
          ? previous
          : {
              scope: remoteScope,
              page: nextPage,
              tasks: remoteData.tasks,
              hasMore: remoteData.hasMore,
            },
      );
      // A restarted server can resume at the same cursor after rebuilding its first page.
      if (remoteData.nextSearchPage === page) refreshWorkspace();
    }
  }, [
    remoteScope,
    remoteReady,
    remoteData,
    page,
    workspaceTasks.isPending,
    workspaceTasks.error,
    refreshWorkspace,
  ]);
  const remoteMatches = remoteReady ? (remoteData?.tasks ?? saved?.tasks) : undefined;
  const tasks = useMemo(() => {
    if (!ready) return [];
    const terms = normalizedQuery.toLocaleLowerCase().split(/\s+/);
    const matches = new Map<string, ClickUpTask>();
    for (const task of sprintTasks.data?.tasks ?? []) {
      if (terms.every((term) => `${task.name} ${task.taskId}`.toLocaleLowerCase().includes(term))) {
        matches.set(`${task.workspaceId}:${task.taskId}`, task);
      }
    }
    for (const task of remoteMatches ?? []) {
      const key = `${task.workspaceId}:${task.taskId}`;
      if (!matches.has(key)) matches.set(key, task);
    }
    return [...matches.values()];
  }, [ready, normalizedQuery, sprintTasks.data, remoteMatches]);
  const searchingWorkspace =
    searching &&
    (normalizedQuery !== settledQuery ||
      workspaceTasks.isPending ||
      (!workspaceTasks.error && remoteData?.nextSearchPage !== undefined));
  const error = connection.error ?? sprints.error ?? sprintTasks.error ?? workspaceTasks.error;
  return {
    label: !normalizedQuery
      ? "My current sprint"
      : searchingWorkspace
        ? "My sprint first · searching ClickUp…"
        : workspaceTasks.error
          ? "My sprint · ClickUp search unavailable"
          : (remoteData?.hasMore ?? saved?.hasMore)
            ? "My sprint + workspace · first 50 workspace matches, keep typing to narrow"
            : "My sprint + workspace",
    tasks,
    isLoading:
      active &&
      (connection.isPending || sprints.isPending || sprintTasks.isPending || searchingWorkspace),
    emptyState: !supported
      ? "Update this environment to attach tasks in the composer."
      : (error ??
        (!account?.user
          ? "Connect ClickUp in Settings to attach a task."
          : !workspaceId
            ? "No accessible ClickUp workspace."
            : normalizedQuery
              ? "No matching tasks."
              : !sprintId
                ? "No current sprint. Type to search workspace tasks."
                : "No tasks assigned to you in the current sprint.")),
  };
}
