import type { ScopedThreadRef } from "@t3tools/contracts";
import { Link } from "@tanstack/react-router";
import { ClipboardListIcon, PlusIcon, XIcon } from "lucide-react";
import { useState } from "react";
import { useThreadShell } from "../../state/entities";
import { useEnvironmentQuery } from "../../state/query";
import { serverEnvironment } from "../../state/server";
import { threadEnvironment } from "../../state/threads";
import { useAtomCommand } from "../../state/use-atom-command";
import { useRightPanelStore } from "../../rightPanelStore";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { ScrollArea } from "../ui/scroll-area";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { ClickUpTaskHandoffs } from "./ClickUpTaskHandoffs";
import { LinkThreadTask } from "./LinkThreadTask";

export function ThreadTasksPanel({ threadRef }: { threadRef: ScopedThreadRef }) {
  const thread = useThreadShell(threadRef);
  const links = thread?.clickUpTasks ?? [];
  const [adding, setAdding] = useState(false);
  const [handoffTaskKey, setHandoffTaskKey] = useState<string | null>(null);
  const handoffTask =
    links.find((task) => `${task.workspaceId}:${task.taskId}` === handoffTaskKey) ??
    links.find((task) => task.primary) ??
    links[0];
  const account = useEnvironmentQuery(
    serverEnvironment.clickUpConnection({ environmentId: threadRef.environmentId, input: {} }),
  );
  const unlink = useAtomCommand(threadEnvironment.unlinkTask);
  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col" aria-label="Linked tasks">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="text-sm font-medium">
          Linked tasks <span className="text-muted-foreground">{links.length}</span>
        </h2>
        <Button size="sm" variant="ghost" onClick={() => setAdding(!adding)}>
          <PlusIcon className="size-3.5" />
          Link task
        </Button>
      </div>
      {adding && account.data?.user ? (
        <LinkThreadTask
          threadRef={threadRef}
          account={account.data}
          initialWorkspaceId={links.find((task) => task.primary)?.workspaceId}
          linkedKeys={links.map((task) => `${task.workspaceId}:${task.taskId}`)}
          onLinked={() => setAdding(false)}
        />
      ) : null}
      {adding && !account.data?.user ? (
        <p className="p-4 text-sm text-muted-foreground">
          {account.error ??
            (account.isPending
              ? "Loading connection…"
              : "Connect ClickUp in Settings → Integrations to link a task.")}
        </p>
      ) : null}
      <ScrollArea className="min-h-0 flex-1">
        {!links.length ? (
          <p className="p-4 text-sm text-muted-foreground">No tasks linked to this thread yet.</p>
        ) : (
          links.map((task) => (
            <div
              key={`${task.workspaceId}:${task.taskId}`}
              className="flex items-center gap-2 border-b border-border/50 p-3 hover:bg-muted/30"
            >
              <ClipboardListIcon className="size-4 shrink-0 text-muted-foreground" />
              <button
                type="button"
                className="min-w-0 flex-1 space-y-1 text-left"
                onClick={() => useRightPanelStore.getState().openTask(threadRef, task)}
              >
                <span className="block truncate text-sm">{task.name}</span>
                <span className="block text-xs text-muted-foreground">#{task.taskId}</span>
              </button>
              <Badge variant="secondary" size="sm">
                {task.primary ? "Primary" : "Context"}
              </Badge>
              {!task.primary ? (
                <Button
                  size="icon-xs"
                  variant="ghost"
                  aria-label={`Unlink ${task.name}`}
                  onClick={() =>
                    void unlink({
                      environmentId: threadRef.environmentId,
                      input: {
                        threadId: threadRef.threadId,
                        workspaceId: task.workspaceId,
                        taskId: task.taskId,
                      },
                    })
                  }
                >
                  <XIcon className="size-3.5" />
                </Button>
              ) : null}
            </div>
          ))
        )}
        {handoffTask && (
          <div className="space-y-4 p-4">
            {links.length > 1 && (
              <Select
                value={`${handoffTask.workspaceId}:${handoffTask.taskId}`}
                onValueChange={setHandoffTaskKey}
                items={links.map((task) => ({
                  value: `${task.workspaceId}:${task.taskId}`,
                  label: task.name,
                }))}
              >
                <SelectTrigger aria-label="Handoff task">
                  <SelectValue />
                </SelectTrigger>
                <SelectPopup>
                  {links.map((task) => (
                    <SelectItem
                      key={`${task.workspaceId}:${task.taskId}`}
                      value={`${task.workspaceId}:${task.taskId}`}
                    >
                      {task.name}
                    </SelectItem>
                  ))}
                </SelectPopup>
              </Select>
            )}
            {account.error ? (
              <p role="alert" className="text-sm text-destructive">
                {account.error}
              </p>
            ) : !account.data ? (
              <p role="status" className="text-sm text-muted-foreground">
                Loading handoff connection…
              </p>
            ) : !account.data.user ||
              !account.data.workspaces.some(
                (workspace) => workspace.id === handoffTask.workspaceId,
              ) ? (
              <div className="space-y-2 text-sm">
                <p>Connect ClickUp with access to this task’s workspace to view its handoff.</p>
                <Link
                  className="text-primary underline"
                  to="/settings/integrations"
                  search={{ machine: threadRef.environmentId }}
                >
                  ClickUp settings
                </Link>
              </div>
            ) : (
              <ClickUpTaskHandoffs
                key={`${threadRef.environmentId}:${account.data.user.id}:${handoffTask.workspaceId}:${handoffTask.taskId}:${threadRef.threadId}`}
                environmentId={threadRef.environmentId}
                input={{
                  workspaceId: handoffTask.workspaceId,
                  taskId: handoffTask.taskId,
                  userId: account.data.user.id,
                }}
                threadId={threadRef.threadId}
                refreshKey={thread?.latestTurn?.completedAt ?? null}
              />
            )}
          </div>
        )}
      </ScrollArea>
    </section>
  );
}
