import { useAtomValue } from "@effect/atom-react";
import type { EnvironmentId } from "@t3tools/contracts";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import * as Option from "effect/Option";
import { AsyncResult } from "effect/unstable/reactivity";
import { ArrowLeftIcon, Settings2Icon } from "lucide-react";
import { isElectron } from "../../env";
import { appAtomRegistry } from "../../rpc/atomRegistry";
import { useEnvironments, usePrimaryEnvironmentId } from "../../state/environments";
import { serverEnvironment } from "../../state/server";
import { WorkspacePageHeader } from "../WorkspacePageHeader";
import { Button } from "../ui/button";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { SidebarInset } from "../ui/sidebar";
import { ClickUpTaskPanel } from "./ClickUpTaskPanel";
import { ClickUpTaskWorkspace } from "./ClickUpTaskWorkspace";

export function ClickUpPage() {
  const search = useSearch({ from: "/tasks" });
  const navigate = useNavigate({ from: "/tasks" });
  const primaryId = usePrimaryEnvironmentId();
  const { environments } = useEnvironments();
  const environmentId = search.environmentId ?? primaryId;
  const environment = environments.find((candidate) => candidate.environmentId === environmentId);
  return (
    <SidebarInset className="h-dvh min-h-0 overflow-hidden bg-background text-foreground">
      <WorkspacePageHeader electron={isElectron} className="border-b border-border">
        {search.taskId ? (
          <Link
            to="/tasks"
            search={({ taskId: _taskId, ...rest }) => rest}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeftIcon className="size-4" /> Tasks
          </Link>
        ) : (
          <h1 className="text-sm font-medium">Tasks</h1>
        )}
        {search.taskId && (
          <span className="truncate text-xs text-muted-foreground">/ {search.taskId}</span>
        )}
        <div className="ml-auto w-52 max-w-[50%]">
          <Select
            value={environmentId}
            onValueChange={(value) => {
              if (value) void navigate({ search: { environmentId: value as EnvironmentId } });
            }}
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
      </WorkspacePageHeader>
      {!environmentId || environment?.connection.phase !== "connected" ? (
        <p className="p-8 text-sm text-muted-foreground">
          Connect to an environment to see its ClickUp tasks.
        </p>
      ) : environment.serverConfig?.environment.capabilities.clickUpTasks !== true ? (
        <p className="p-8 text-sm text-muted-foreground">
          Update this environment to use ClickUp tasks.
        </p>
      ) : (
        <ConnectedTasks key={environmentId} environmentId={environmentId} />
      )}
    </SidebarInset>
  );
}

function ConnectedTasks({ environmentId }: { environmentId: EnvironmentId }) {
  const search = useSearch({ from: "/tasks" });
  const navigate = useNavigate({ from: "/tasks" });
  const query = serverEnvironment.clickUpConnection({ environmentId, input: {} });
  const result = useAtomValue(query);
  const account = Option.getOrNull(AsyncResult.value(result));
  const workspaceId = account?.workspaces.some((item) => item.id === search.workspaceId)
    ? search.workspaceId
    : account?.workspaces[0]?.id;
  return (
    <>
      {!search.taskId && (
        <div className="flex shrink-0 items-center gap-3 border-b border-border px-5 py-3">
          <div className="w-56 max-w-[60%]">
            <Select
              value={workspaceId ?? null}
              onValueChange={(value) => {
                if (value) void navigate({ search: { environmentId, workspaceId: value } });
              }}
              items={(account?.workspaces ?? []).map((item) => ({
                value: item.id,
                label: item.name,
              }))}
            >
              <SelectTrigger aria-label="ClickUp workspace">
                <SelectValue placeholder="ClickUp workspace" />
              </SelectTrigger>
              <SelectPopup>
                {account?.workspaces.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.name}
                  </SelectItem>
                ))}
              </SelectPopup>
            </Select>
          </div>
          <span className="hidden truncate text-xs text-muted-foreground sm:block">
            {account?.user?.username}
          </span>
          <Link
            to="/settings/integrations"
            search={{ machine: environmentId }}
            className="ml-auto flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground"
          >
            <Settings2Icon className="size-4" /> Connection
          </Link>
        </div>
      )}
      {AsyncResult.isFailure(result) ? (
        <div className="space-y-3 p-8">
          <p role="alert" className="text-sm text-destructive">
            ClickUp is unavailable. Retry or reconnect in Integrations.
          </p>
          <Button size="sm" variant="outline" onClick={() => appAtomRegistry.refresh(query)}>
            Retry connection
          </Button>
        </div>
      ) : !account ? (
        <p role="status" className="p-8 text-sm text-muted-foreground">
          Loading connection…
        </p>
      ) : !account.user ? (
        <div className="space-y-3 p-8">
          <p className="text-sm text-muted-foreground">Connect ClickUp to see your tasks.</p>
          <Link
            to="/settings/integrations"
            search={{ machine: environmentId }}
            className="text-sm text-primary underline"
          >
            Connect ClickUp
          </Link>
        </div>
      ) : !workspaceId ? (
        <p className="p-8 text-sm text-muted-foreground">
          No authorized workspaces. Reconnect and grant access to your workspace.
        </p>
      ) : search.taskId ? (
        <ClickUpTaskPanel
          key={`${environmentId}:${account.user.id}:${workspaceId}:${search.taskId}`}
          environmentId={environmentId}
          input={{ workspaceId, taskId: search.taskId, userId: account.user.id }}
        />
      ) : (
        <ClickUpTaskWorkspace
          key={`${environmentId}:${account.user.id}:${workspaceId}`}
          environmentId={environmentId}
          workspaceId={workspaceId}
          userId={account.user.id}
        />
      )}
    </>
  );
}
