import { useAtomValue } from "@effect/atom-react";
import type { ClickUpTask, EnvironmentId, ThreadId } from "@t3tools/contracts";
import * as Option from "effect/Option";
import { AsyncResult } from "effect/unstable/reactivity";
import { useEffect, useRef } from "react";
import { appAtomRegistry } from "../../rpc/atomRegistry";
import { serverEnvironment } from "../../state/server";
import { ClickUpTaskActionButtons } from "./ClickUpTaskActions";
import type { ClickUpTaskAction } from "./taskPrompt";

export function ClickUpSprintTaskActions({
  environmentId,
  workspaceId,
  userId,
  task,
  runningThreadIds,
  onSelect,
}: {
  environmentId: EnvironmentId;
  workspaceId: string;
  userId: number;
  task: ClickUpTask;
  runningThreadIds: ReadonlySet<ThreadId>;
  onSelect: (action: ClickUpTaskAction) => void;
}) {
  const query = serverEnvironment.clickUpThreads({
    environmentId,
    input: { workspaceId, userId, taskId: task.taskId },
  });
  const result = useAtomValue(query);
  const refreshKey = JSON.stringify([
    environmentId,
    workspaceId,
    userId,
    task.taskId,
    [...runningThreadIds].sort(),
  ]);
  const lastRefreshKey = useRef<string | null>(null);
  useEffect(() => {
    if (lastRefreshKey.current === refreshKey) return;
    lastRefreshKey.current = refreshKey;
    // A newly started thread may have been linked since the cached query ran.
    appAtomRegistry.refresh(query);
  }, [query, refreshKey]);
  const links = Option.getOrNull(AsyncResult.value(result)) ?? [];
  const thread = links.find((link) => runningThreadIds.has(link.threadId));
  return (
    <ClickUpTaskActionButtons
      compact
      task={task}
      runningThread={thread ? { environmentId, threadId: thread.threadId } : undefined}
      onSelect={onSelect}
    />
  );
}
