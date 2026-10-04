import type { ScopedThreadRef } from "@t3tools/contracts";
import { useState } from "react";
import { useThreadShell } from "../../state/entities";
import { threadEnvironment } from "../../state/threads";
import { useAtomCommand } from "../../state/use-atom-command";
import { Button } from "../ui/button";
import { Input } from "../ui/input";

function parseTaskId(value: string): string | null {
  const text = value.trim();
  if (/^[a-zA-Z0-9_-]{1,128}$/.test(text)) return text;
  try {
    const url = new URL(text);
    if (url.protocol !== "https:" || url.hostname !== "app.clickup.com") return null;
    return /^\/t\/([a-zA-Z0-9_-]{1,128})(?:\/|$)/.exec(url.pathname)?.[1] ?? null;
  } catch {
    return null;
  }
}

export function LinkThreadTask({
  threadRef,
  onLinked,
}: {
  threadRef: ScopedThreadRef;
  onLinked: () => void;
}) {
  const thread = useThreadShell(threadRef);
  const updateMetadata = useAtomCommand(threadEnvironment.updateMetadata);
  const [workspaceId, setWorkspaceId] = useState("");
  const [reference, setReference] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  return (
    <form
      className="space-y-3 border-b border-border p-4"
      onSubmit={async (event) => {
        event.preventDefault();
        const taskId = parseTaskId(reference);
        if (!taskId || !/^[a-zA-Z0-9_-]{1,128}$/.test(workspaceId.trim()) || !name.trim()) {
          setError("Enter a task URL or ID, workspace ID, and task name.");
          return;
        }
        const existing = thread?.clickUpTasks ?? [];
        if (
          existing.some((task) => task.workspaceId === workspaceId.trim() && task.taskId === taskId)
        ) {
          setError("That task is already linked to this thread.");
          return;
        }
        setError(null);
        setSaving(true);
        try {
          const result = await updateMetadata({
            environmentId: threadRef.environmentId,
            input: {
              threadId: threadRef.threadId,
              clickUpTaskLinkUpdate: {
                type: "link",
                task: {
                  workspaceId: workspaceId.trim(),
                  taskId,
                  name: name.trim(),
                },
              },
            },
          });
          if (result._tag === "Success") onLinked();
          else setError("Could not save the task link.");
        } finally {
          setSaving(false);
        }
      }}
    >
      <Input
        aria-label="ClickUp workspace ID"
        value={workspaceId}
        onChange={(event) => setWorkspaceId(event.target.value)}
        placeholder="Workspace ID"
      />
      <Input
        aria-label="ClickUp task URL or ID"
        value={reference}
        onChange={(event) => setReference(event.target.value)}
        placeholder="ClickUp task URL or ID"
      />
      <Input
        aria-label="Task name"
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder="Task name"
      />
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
      <Button type="submit" size="sm" disabled={saving}>
        {saving ? "Saving…" : "Save task link"}
      </Button>
    </form>
  );
}
