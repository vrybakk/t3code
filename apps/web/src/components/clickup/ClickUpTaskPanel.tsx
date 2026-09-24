import { useAtomValue } from "@effect/atom-react";
import type { ClickUpTaskInput, EnvironmentId } from "@t3tools/contracts";
import * as Option from "effect/Option";
import { AsyncResult } from "effect/unstable/reactivity";
import { ExternalLinkIcon, PaperclipIcon, RefreshCwIcon } from "lucide-react";
import { serverEnvironment } from "../../state/server";
import { appAtomRegistry } from "../../rpc/atomRegistry";
import ChatMarkdown from "../ChatMarkdown";
import { Button } from "../ui/button";
import { ScrollArea } from "../ui/scroll-area";
import { ClickUpTaskActivity } from "./ClickUpTaskActivity";
import { ClickUpCustomFields, ClickUpTaskFields } from "./ClickUpTaskFields";
import { ClickUpTaskWork } from "./ClickUpTaskWork";
import { safeClickUpAttachmentUrl } from "./taskPrompt";

export function ClickUpTaskPanel({
  environmentId,
  input,
}: {
  environmentId: EnvironmentId;
  input: ClickUpTaskInput;
}) {
  const query = serverEnvironment.clickUpTask({ environmentId, input });
  const result = useAtomValue(query);
  const details = Option.getOrNull(AsyncResult.value(result));
  const linksQuery = serverEnvironment.clickUpThreads({ environmentId, input });
  return (
    <section aria-label="Task details" className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-3 border-b border-border px-5 py-3">
        <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
          {details?.task.listName ?? "Task details"}
        </p>
        <Button
          size="sm"
          variant="ghost"
          disabled={result.waiting}
          onClick={() => {
            appAtomRegistry.refresh(query);
            appAtomRegistry.refresh(linksQuery);
          }}
        >
          <RefreshCwIcon className="size-4" /> Refresh task
        </Button>
        <a
          href={`https://app.clickup.com/t/${encodeURIComponent(input.taskId)}`}
          target="_blank"
          rel="noreferrer"
          className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          Open in ClickUp <ExternalLinkIcon className="size-3.5" />
        </a>
      </div>
      {AsyncResult.isFailure(result) ? (
        <p role="alert" className="p-8 text-sm text-destructive">
          Could not load this task. Check your connection and ClickUp access, then refresh.
        </p>
      ) : !details ? (
        <p role="status" className="p-8 text-sm text-muted-foreground">
          Loading task…
        </p>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
          <ScrollArea className="min-h-0 min-w-0 flex-1">
            <div className="mx-auto max-w-4xl space-y-7 px-6 py-8 xl:px-10">
              <h2 className="text-2xl font-semibold leading-snug tracking-tight">
                {details.task.name}
              </h2>
              <ClickUpTaskFields details={details} />
              <section aria-label="Description" className="space-y-4 border-t border-border pt-6">
                <h3 className="text-sm font-medium">Description</h3>
                <ChatMarkdown
                  text={details.task.description || "No description provided."}
                  cwd={undefined}
                  environmentId={environmentId}
                />
              </section>
              <ClickUpCustomFields details={details} />
              <ClickUpTaskWork environmentId={environmentId} input={input} details={details} />
              <section className="space-y-3 border-t border-border pt-6" aria-label="Attachments">
                <h3 className="flex items-center gap-2 text-sm font-medium">
                  <PaperclipIcon className="size-4" /> Attachments{" "}
                  <span className="text-muted-foreground">{details.attachments.length}</span>
                </h3>
                {!details.attachments.length && (
                  <p className="text-sm text-muted-foreground">No attachments.</p>
                )}
                {details.attachments.map((attachment) => {
                  const url = safeClickUpAttachmentUrl(attachment.url);
                  return url ? (
                    <a
                      key={attachment.url}
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      className="block rounded-md border border-border p-3 text-sm text-primary hover:bg-muted/40"
                    >
                      {attachment.name}
                    </a>
                  ) : (
                    <p key={attachment.url} className="text-sm text-muted-foreground">
                      {attachment.name} — open in ClickUp
                    </p>
                  );
                })}
              </section>
              {details.metadata?.checklists.map((checklist) => (
                <section key={checklist.id} className="space-y-3 border-t border-border pt-6">
                  <h3 className="text-sm font-medium">{checklist.name}</h3>
                  <ul className="space-y-2">
                    {checklist.items.map((item) => (
                      <li key={item.id} className="flex items-start gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={item.resolved}
                          readOnly
                          aria-label={item.name}
                          className="mt-1"
                        />
                        <span className={item.resolved ? "text-muted-foreground line-through" : ""}>
                          {item.name}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
              {Boolean(details.metadata?.subtasks.length) && (
                <section className="space-y-3 border-t border-border pt-6">
                  <h3 className="text-sm font-medium">Subtasks</h3>
                  {details.metadata?.subtasks.map((task) => (
                    <a
                      key={task.id}
                      href={`https://app.clickup.com/t/${encodeURIComponent(task.id)}`}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center justify-between gap-3 text-sm text-primary hover:underline"
                    >
                      {task.name}
                      <span className="text-xs text-muted-foreground">{task.status}</span>
                    </a>
                  ))}
                </section>
              )}
              {Boolean(details.metadata?.relatedTasks.length) && (
                <section className="space-y-3 border-t border-border pt-6">
                  <h3 className="text-sm font-medium">Related tasks</h3>
                  {details.metadata?.relatedTasks.map((task) => (
                    <a
                      key={`${task.id}:${task.label}`}
                      href={`https://app.clickup.com/t/${encodeURIComponent(task.id)}`}
                      target="_blank"
                      rel="noreferrer"
                      className="block text-sm text-primary hover:underline"
                    >
                      {task.label} · {task.id}
                    </a>
                  ))}
                </section>
              )}
            </div>
          </ScrollArea>
          <ClickUpTaskActivity details={details} />
        </div>
      )}
    </section>
  );
}
