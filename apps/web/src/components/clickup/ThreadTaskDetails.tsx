import type { ClickUpTaskDetails, ClickUpTaskReference, EnvironmentId } from "@t3tools/contracts";
import { ArrowLeftIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useEnvironmentQuery } from "../../state/query";
import { serverEnvironment } from "../../state/server";
import { Button } from "../ui/button";
import { ClickUpTaskPanel } from "./ClickUpTaskPanel";

export function ThreadTaskDetails({
  environmentId,
  task,
  onStartTask,
  onBack,
}: {
  environmentId: EnvironmentId;
  task: ClickUpTaskReference;
  onStartTask?: ((details: ClickUpTaskDetails) => void) | undefined;
  onBack?: (() => void) | undefined;
}) {
  const connection = useEnvironmentQuery(
    serverEnvironment.clickUpConnection({ environmentId, input: {} }),
  );
  const account = connection.data;
  let content: ReactNode;
  if (connection.error) {
    content = (
      <p role="alert" className="p-4 text-sm text-destructive">
        {connection.error}
      </p>
    );
  } else if (!account) {
    content = (
      <p role="status" className="p-4 text-sm text-muted-foreground">
        Loading task connection…
      </p>
    );
  } else if (
    !account.user ||
    !account.workspaces.some((workspace) => workspace.id === task.workspaceId)
  ) {
    content = (
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
  } else {
    content = (
      <ClickUpTaskPanel
        key={`${environmentId}:${account.user.id}:${task.workspaceId}:${task.taskId}`}
        environmentId={environmentId}
        input={{ workspaceId: task.workspaceId, taskId: task.taskId, userId: account.user.id }}
        {...(onStartTask ? { onStartTask } : {})}
      />
    );
  }
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      {onBack && (
        <div className="shrink-0 border-b border-border px-3 py-2">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeftIcon className="size-3.5" /> Back to linked tasks
          </Button>
        </div>
      )}
      {content}
    </div>
  );
}
