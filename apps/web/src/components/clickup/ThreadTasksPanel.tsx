import type { ScopedThreadRef } from "@t3tools/contracts";
import { ClipboardListIcon, ExternalLinkIcon, PlusIcon, XIcon } from "lucide-react";
import { useState } from "react";
import { useThreadShell } from "../../state/entities";
import { threadEnvironment } from "../../state/threads";
import { useAtomCommand } from "../../state/use-atom-command";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { ScrollArea } from "../ui/scroll-area";
import { LinkThreadTask } from "./LinkThreadTask";

export function ThreadTasksPanel({ threadRef }: { threadRef: ScopedThreadRef }) {
  const thread = useThreadShell(threadRef);
  const links = thread?.clickUpTasks ?? [];
  const [adding, setAdding] = useState(false);
  const updateMetadata = useAtomCommand(threadEnvironment.updateMetadata);

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
      {adding ? <LinkThreadTask threadRef={threadRef} onLinked={() => setAdding(false)} /> : null}
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
              <a
                className="min-w-0 flex-1 space-y-1 text-left"
                href={`https://app.clickup.com/t/${encodeURIComponent(task.taskId)}`}
                target="_blank"
                rel="noreferrer"
              >
                <span className="block truncate text-sm">{task.name}</span>
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  #{task.taskId} <ExternalLinkIcon className="size-3" />
                </span>
              </a>
              <Badge variant="secondary" size="sm">
                {task.primary ? "Primary" : "Context"}
              </Badge>
              <Button
                size="icon-xs"
                variant="ghost"
                aria-label={`Unlink ${task.name}`}
                onClick={() => {
                  const remaining = links.filter(
                    (linked) =>
                      linked.workspaceId !== task.workspaceId || linked.taskId !== task.taskId,
                  );
                  const next = remaining.map((linked, index) => ({
                    ...linked,
                    primary: index === 0,
                  }));
                  void updateMetadata({
                    environmentId: threadRef.environmentId,
                    input: { threadId: threadRef.threadId, clickUpTasks: next },
                  });
                }}
              >
                <XIcon className="size-3.5" />
              </Button>
            </div>
          ))
        )}
      </ScrollArea>
    </section>
  );
}
