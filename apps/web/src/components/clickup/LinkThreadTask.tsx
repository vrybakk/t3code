import type { ClickUpConnection, ClickUpTaskInput, ScopedThreadRef } from "@t3tools/contracts";
import { useState } from "react";
import { useEnvironmentQuery } from "../../state/query";
import { serverEnvironment } from "../../state/server";
import { threadEnvironment } from "../../state/threads";
import { useAtomCommand } from "../../state/use-atom-command";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";

export function parseClickUpTaskId(value: string): string | null {
  const text = value.trim();
  if (/^[a-zA-Z0-9_-]{1,128}$/.test(text)) return text;
  try {
    const url = new URL(text);
    if (url.protocol !== "https:" || url.hostname !== "app.clickup.com") return null;
    return /^\/t\/([a-zA-Z0-9_-]{1,128})\/?$/.exec(url.pathname)?.[1] ?? null;
  } catch {
    return null;
  }
}

export function LinkThreadTask({
  threadRef,
  account,
  initialWorkspaceId,
  linkedKeys,
  onLinked,
}: {
  threadRef: ScopedThreadRef;
  account: ClickUpConnection;
  initialWorkspaceId?: string | undefined;
  linkedKeys: readonly string[];
  onLinked: () => void;
}) {
  const [workspaceId, setWorkspaceId] = useState(
    account.workspaces.find((workspace) => workspace.id === initialWorkspaceId)?.id ??
      account.workspaces[0]?.id ??
      "",
  );
  const [reference, setReference] = useState("");
  const [candidate, setCandidate] = useState<ClickUpTaskInput | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const taskQuery = useEnvironmentQuery(
    candidate
      ? serverEnvironment.clickUpTask({ environmentId: threadRef.environmentId, input: candidate })
      : null,
  );
  const link = useAtomCommand(threadEnvironment.linkTask);
  const task = taskQuery.data?.task;
  const alreadyLinked = task && linkedKeys.includes(`${task.workspaceId}:${task.taskId}`);
  return (
    <div className="space-y-3 border-b border-border p-4">
      <Select
        value={workspaceId}
        onValueChange={(value) => {
          if (value) setWorkspaceId(value);
          setCandidate(null);
        }}
        items={account.workspaces.map((workspace) => ({
          value: workspace.id,
          label: workspace.name,
        }))}
      >
        <SelectTrigger aria-label="Task workspace">
          <SelectValue placeholder="Workspace" />
        </SelectTrigger>
        <SelectPopup>
          {account.workspaces.map((workspace) => (
            <SelectItem key={workspace.id} value={workspace.id}>
              {workspace.name}
            </SelectItem>
          ))}
        </SelectPopup>
      </Select>
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          const taskId = parseClickUpTaskId(reference);
          if (!taskId) {
            setError("Enter a ClickUp task URL or task ID.");
            return;
          }
          if (!account.user) return;
          setError(null);
          setCandidate({ workspaceId, taskId, userId: account.user.id });
        }}
      >
        <Input
          aria-label="Task URL or ID"
          value={reference}
          onChange={(event) => {
            setReference(event.target.value);
            setCandidate(null);
          }}
          placeholder="Paste a ClickUp task URL or ID"
        />
        <Button
          type="submit"
          variant="outline"
          disabled={!workspaceId || !account.user || taskQuery.isPending}
        >
          Find task
        </Button>
      </form>
      {taskQuery.isPending ? (
        <p role="status" className="text-xs text-muted-foreground">
          Finding task…
        </p>
      ) : null}
      {error || taskQuery.error ? (
        <p role="alert" className="text-xs text-destructive">
          {error ?? taskQuery.error}
        </p>
      ) : null}
      {task && candidate ? (
        <div className="space-y-2">
          <p className="text-sm font-medium">{task.name}</p>
          <p className="text-xs text-muted-foreground">
            {task.status} · {task.listName}
          </p>
          <Button
            size="sm"
            disabled={saving || alreadyLinked}
            onClick={async () => {
              setSaving(true);
              try {
                const result = await link({
                  environmentId: threadRef.environmentId,
                  input: {
                    threadId: threadRef.threadId,
                    task: { workspaceId: task.workspaceId, taskId: task.taskId, name: task.name },
                  },
                });
                if (result._tag === "Success") onLinked();
              } finally {
                setSaving(false);
              }
            }}
          >
            {alreadyLinked ? "Already linked" : saving ? "Linking…" : "Link task"}
          </Button>
          <p className="text-xs text-muted-foreground">
            Adds context to this thread. The original workflow task stays primary.
          </p>
        </div>
      ) : null}
    </div>
  );
}
