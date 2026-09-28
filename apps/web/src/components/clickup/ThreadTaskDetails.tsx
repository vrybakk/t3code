import type { ClickUpTaskReference, EnvironmentId, ThreadId } from "@t3tools/contracts";
import { Link } from "@tanstack/react-router";
import { useEnvironmentQuery } from "../../state/query";
import { serverEnvironment } from "../../state/server";
import { ScrollArea } from "../ui/scroll-area";
import { ClickUpTaskHandoffs } from "./ClickUpTaskHandoffs";
import { ClickUpTaskPanel } from "./ClickUpTaskPanel";

export function ThreadTaskDetails({
  environmentId,
  task,
  handoffThreadId,
}: {
  environmentId: EnvironmentId;
  task: ClickUpTaskReference;
  handoffThreadId?: ThreadId;
}) {
  const connection = useEnvironmentQuery(
    serverEnvironment.clickUpConnection({ environmentId, input: {} }),
  );
  const account = connection.data;
  if (connection.error)
    return (
      <p role="alert" className="p-4 text-sm text-destructive">
        {connection.error}
      </p>
    );
  if (!account)
    return (
      <p role="status" className="p-4 text-sm text-muted-foreground">
        Loading task connection…
      </p>
    );
  if (!account.user || !account.workspaces.some((workspace) => workspace.id === task.workspaceId)) {
    return (
      <div className="space-y-3 p-4 text-sm">
        <p>Connect ClickUp with access to this task’s workspace.</p>
        <Link
          className="text-primary underline"
          to="/settings/integrations"
          search={{ machine: environmentId }}
        >
          ClickUp settings
        </Link>
      </div>
    );
  }
  if (handoffThreadId)
    return (
      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-4 p-4">
          <p className="text-sm font-medium">{task.name}</p>
          <ClickUpTaskHandoffs
            environmentId={environmentId}
            input={{ workspaceId: task.workspaceId, taskId: task.taskId, userId: account.user.id }}
            threadId={handoffThreadId}
          />
        </div>
      </ScrollArea>
    );
  return (
    <ClickUpTaskPanel
      key={`${task.workspaceId}:${task.taskId}`}
      environmentId={environmentId}
      input={{ workspaceId: task.workspaceId, taskId: task.taskId, userId: account.user.id }}
    />
  );
}
