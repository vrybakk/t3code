import { useAtomValue } from "@effect/atom-react";
import type { EnvironmentId } from "@t3tools/contracts";
import { Link } from "@tanstack/react-router";
import * as Option from "effect/Option";
import { AsyncResult } from "effect/unstable/reactivity";
import { useState } from "react";
import { isElectron } from "../../env";
import { appAtomRegistry } from "../../rpc/atomRegistry";
import { useEnvironments, usePrimaryEnvironmentId } from "../../state/environments";
import { serverEnvironment } from "../../state/server";
import { WorkspacePageContainer } from "../WorkspacePageContainer";
import { WorkspacePageHeader } from "../WorkspacePageHeader";
import { Button } from "../ui/button";
import { ScrollArea } from "../ui/scroll-area";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { SidebarInset } from "../ui/sidebar";
import { ClickUpTaskPanel } from "./ClickUpTaskPanel";

export function ClickUpPage() {
  const primaryId = usePrimaryEnvironmentId();
  const { environments } = useEnvironments();
  const [selectedId, setSelectedId] = useState<EnvironmentId | null>(null);
  const environmentId = selectedId ?? primaryId;
  const environment = environments.find((candidate) => candidate.environmentId === environmentId);
  return (
    <SidebarInset className="h-dvh min-h-0 overflow-hidden bg-background text-foreground">
      <WorkspacePageHeader electron={isElectron}>
        <h1>Tasks</h1>
      </WorkspacePageHeader>
      <ScrollArea className="min-h-0 flex-1">
        <WorkspacePageContainer width="expanded">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-medium">My ClickUp tasks</h2>
              <p className="text-sm text-muted-foreground">
                Assigned work and the coding threads connected to it.
              </p>
            </div>
            <Select
              value={environmentId}
              onValueChange={(value) => setSelectedId(value as EnvironmentId | null)}
              items={environments.map((item) => ({ value: item.environmentId, label: item.label }))}
            >
              <SelectTrigger aria-label="Environment">
                <SelectValue placeholder="Choose environment" />
              </SelectTrigger>
              <SelectPopup>
                {environments.map((item) => (
                  <SelectItem key={item.environmentId} value={item.environmentId}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectPopup>
            </Select>
          </div>
          {!environmentId || environment?.connection.phase !== "connected" ? (
            <p className="text-sm text-muted-foreground">
              Connect to an environment to see its ClickUp tasks.
            </p>
          ) : environment.serverConfig?.environment.capabilities.clickUpTasks !== true ? (
            <p className="text-sm text-muted-foreground">
              Update this environment to use ClickUp tasks.
            </p>
          ) : (
            <ConnectedTasks key={environmentId} environmentId={environmentId} />
          )}
        </WorkspacePageContainer>
      </ScrollArea>
    </SidebarInset>
  );
}

function ConnectedTasks({ environmentId }: { environmentId: EnvironmentId }) {
  const query = serverEnvironment.clickUpConnection({ environmentId, input: {} });
  const result = useAtomValue(query);
  const account = Option.getOrNull(AsyncResult.value(result));
  const [workspace, setWorkspace] = useState<string | null>(null);
  const workspaceId = account?.workspaces.some((item) => item.id === workspace)
    ? workspace
    : account?.workspaces[0]?.id;
  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <Link
          to="/settings/integrations"
          search={{ machine: environmentId }}
          className="text-sm text-primary underline"
        >
          Manage ClickUp connection
        </Link>
        <Button
          size="sm"
          variant="outline"
          disabled={result.waiting}
          onClick={() => appAtomRegistry.refresh(query)}
        >
          Refresh connection
        </Button>
        {account?.user && (
          <span className="text-sm text-muted-foreground">{account.user.username}</span>
        )}
      </div>
      {AsyncResult.isFailure(result) ? (
        <p role="alert" className="text-sm text-destructive">
          ClickUp is unavailable. Retry or reconnect in Integrations.
        </p>
      ) : !account ? (
        <p role="status">Loading connection…</p>
      ) : !account.user ? (
        <p className="text-sm text-muted-foreground">
          Connect your ClickUp account in Integrations to load assigned tasks.
        </p>
      ) : !workspaceId ? (
        <p className="text-sm text-muted-foreground">
          No authorized workspaces. Reconnect and grant access to your workspace.
        </p>
      ) : (
        <>
          <Select
            value={workspaceId}
            onValueChange={setWorkspace}
            items={account.workspaces.map((item) => ({ value: item.id, label: item.name }))}
          >
            <SelectTrigger aria-label="ClickUp workspace">
              <SelectValue />
            </SelectTrigger>
            <SelectPopup>
              {account.workspaces.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.name}
                </SelectItem>
              ))}
            </SelectPopup>
          </Select>
          <AssignedTasks
            key={`${account.user.id}:${workspaceId}`}
            environmentId={environmentId}
            workspaceId={workspaceId}
            userId={account.user.id}
          />
        </>
      )}
    </>
  );
}

function AssignedTasks({
  environmentId,
  workspaceId,
  userId,
}: {
  environmentId: EnvironmentId;
  workspaceId: string;
  userId: number;
}) {
  const [page, setPage] = useState(0);
  const [taskId, setTaskId] = useState<string | null>(null);
  const query = serverEnvironment.clickUpTasks({
    environmentId,
    input: { workspaceId, page, userId },
  });
  const result = useAtomValue(query);
  const data = Option.getOrNull(AsyncResult.value(result));
  return (
    <div className="grid min-w-0 gap-5 lg:grid-cols-2">
      <section aria-label="Assigned tasks" className="min-w-0 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium">Open tasks assigned to me</h3>
          <Button
            variant="outline"
            size="sm"
            disabled={result.waiting}
            onClick={() => appAtomRegistry.refresh(query)}
          >
            Refresh tasks
          </Button>
        </div>
        {AsyncResult.isFailure(result) ? (
          <p role="alert" className="text-sm text-destructive">
            Could not load assigned tasks. Retry after checking your connection.
          </p>
        ) : !data ? (
          <p role="status" className="text-sm text-muted-foreground">
            Loading tasks…
          </p>
        ) : data.tasks.length === 0 ? (
          <p className="text-sm text-muted-foreground">No assigned tasks on this page.</p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {data.tasks.map((task) => (
              <li key={task.taskId}>
                <button
                  type="button"
                  onClick={() => setTaskId(task.taskId)}
                  aria-pressed={taskId === task.taskId}
                  className={`w-full space-y-1 p-3 text-left hover:bg-muted/60 ${taskId === task.taskId ? "bg-muted" : ""}`}
                >
                  <span className="block text-sm font-medium">{task.name}</span>
                  <span className="block text-xs text-muted-foreground">
                    {task.listName} · {task.status}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex items-center gap-3">
          <Button
            size="sm"
            variant="outline"
            disabled={page === 0 || result.waiting}
            onClick={() => setPage((value) => value - 1)}
          >
            Previous
          </Button>
          <span className="text-xs text-muted-foreground">Page {page + 1}</span>
          <Button
            size="sm"
            variant="outline"
            disabled={!data?.hasMore || result.waiting || AsyncResult.isFailure(result)}
            onClick={() => setPage((value) => value + 1)}
          >
            Next
          </Button>
        </div>
      </section>
      {taskId ? (
        <ClickUpTaskPanel
          key={`${workspaceId}:${taskId}`}
          environmentId={environmentId}
          input={{ workspaceId, taskId, userId }}
        />
      ) : (
        <div className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">
          Select a task to read its context and open a coding thread.
        </div>
      )}
    </div>
  );
}
