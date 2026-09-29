import { useAtomValue } from "@effect/atom-react";
import type {
  ClickUpTaskDetails,
  ClickUpTaskInput,
  EnvironmentId,
  ScopedThreadRef,
} from "@t3tools/contracts";
import * as Option from "effect/Option";
import { AsyncResult } from "effect/unstable/reactivity";
import {
  CheckIcon,
  CopyIcon,
  ExternalLinkIcon,
  LinkIcon,
  PaperclipIcon,
  RefreshCwIcon,
} from "lucide-react";
import { useRef, useState } from "react";
import { useCopyToClipboard } from "../../hooks/useCopyToClipboard";
import { serverEnvironment } from "../../state/server";
import { formatEnvironmentQueryError } from "../../state/query";
import { appAtomRegistry } from "../../rpc/atomRegistry";
import ChatMarkdown from "../ChatMarkdown";
import { ExternalLink } from "../ExternalLink";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { showAnchoredCopyErrorToast, showAnchoredCopySuccessToast } from "../ui/anchoredCopyToast";
import { ClickUpTaskActivity } from "./ClickUpTaskActivity";
import { ClickUpCustomFields, ClickUpTaskFields } from "./ClickUpTaskFields";
import { ClickUpTaskWork } from "./ClickUpTaskWork";
import { ClickUpAttachments } from "./ClickUpAttachments";
import { ClickUpTaskChecklist } from "./ClickUpTaskChecklist";
import { ClickUpTaskActionButtons, ClickUpTaskActionDialog } from "./ClickUpTaskActions";
import type { ClickUpTaskAction } from "./taskPrompt";
import { ClickUpTaskTypeIcon } from "./ClickUpTaskTypeIcon";

export function ClickUpTaskPanel({
  environmentId,
  threadRef,
  input,
  onStartTask,
}: {
  environmentId: EnvironmentId;
  /** Thread the task is open beside, so its links can open in that thread's integrated browser. */
  threadRef?: ScopedThreadRef | undefined;
  input: ClickUpTaskInput;
  onStartTask?: (details: ClickUpTaskDetails) => void;
}) {
  const [action, setAction] = useState<ClickUpTaskAction | null>(null);
  const taskUrl = `https://app.clickup.com/t/${encodeURIComponent(input.taskId)}`;
  const copyIdRef = useRef<HTMLButtonElement>(null);
  const copyUrlRef = useRef<HTMLButtonElement>(null);
  const copyId = useCopyToClipboard({
    target: "task ID",
    onCopy: () => showAnchoredCopySuccessToast(copyIdRef),
    onError: (error) => showAnchoredCopyErrorToast(copyIdRef, error),
  });
  const copyUrl = useCopyToClipboard({
    target: "task URL",
    onCopy: () => showAnchoredCopySuccessToast(copyUrlRef),
    onError: (error) => showAnchoredCopyErrorToast(copyUrlRef, error),
  });
  const query = serverEnvironment.clickUpTask({ environmentId, input });
  const result = useAtomValue(query);
  const details = Option.getOrNull(AsyncResult.value(result));
  const linksQuery = serverEnvironment.clickUpThreads({ environmentId, input });
  return (
    <section
      aria-label="Task details"
      className="@container/task-panel flex min-h-0 min-w-0 flex-1 flex-col"
    >
      <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-border px-5 py-3">
        <div className="flex min-w-0 basis-full flex-wrap items-center justify-between gap-3 @[64rem]/task-panel:basis-auto @[64rem]/task-panel:flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
            <p className="min-w-0 truncate text-xs text-muted-foreground">
              {details?.task.listName ?? "Task details"}
            </p>
            <ExternalLink
              url={taskUrl}
              environmentId={environmentId}
              threadRef={threadRef}
              favicon={false}
              className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground hover:no-underline"
            >
              Open in ClickUp <ExternalLinkIcon className="size-3.5" />
            </ExternalLink>
          </div>
          <Button
            size="sm"
            variant="ghost"
            disabled={result.waiting}
            onClick={() => {
              appAtomRegistry.refresh(query);
              appAtomRegistry.refresh(linksQuery);
            }}
          >
            <RefreshCwIcon className="size-4" /> Refresh details
          </Button>
        </div>
        {details && (
          <div className="ml-auto flex min-w-0 max-w-full justify-end">
            <ClickUpTaskActionButtons
              task={details.task}
              onSelect={(nextAction) => {
                if (nextAction === "implement" && onStartTask) {
                  if (!details.task.tags?.some((tag) => tag.trim().toLowerCase() === "no agent")) {
                    onStartTask(details);
                  }
                } else {
                  setAction(nextAction);
                }
              }}
            />
          </div>
        )}
      </div>
      {AsyncResult.isFailure(result) && (
        <p role="alert" className="p-8 text-sm text-destructive">
          Could not load this task. {formatEnvironmentQueryError(result.cause)}
        </p>
      )}
      {!details ? (
        !AsyncResult.isFailure(result) && (
          <p role="status" className="p-8 text-sm text-muted-foreground">
            Loading task…
          </p>
        )
      ) : (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto @[64rem]/task-panel:flex-row @[64rem]/task-panel:overflow-hidden">
          <div className="@container/task-content min-w-0 shrink-0 @[64rem]/task-panel:min-h-0 @[64rem]/task-panel:flex-1 @[64rem]/task-panel:overflow-y-auto">
            <div className="mx-auto max-w-4xl space-y-7 px-4 py-6 @[40rem]/task-content:px-8 @[40rem]/task-content:py-8">
              <div className="space-y-3">
                <Badge variant="outline">
                  <ClickUpTaskTypeIcon name={details.task.taskType?.name ?? "Task"} />
                  {details.task.taskType?.name ?? "Task"}
                </Badge>
                <h2 className="break-words text-2xl font-semibold leading-snug tracking-tight">
                  {details.task.name}
                </h2>
                <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="min-w-0 break-all font-mono text-xs text-muted-foreground">
                    #{input.taskId}
                  </span>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      ref={copyIdRef}
                      size="xs"
                      variant="ghost-muted"
                      aria-label="Copy task ID"
                      onClick={() => copyId.copyToClipboard(input.taskId)}
                    >
                      {copyId.isCopied ? <CheckIcon /> : <CopyIcon />}
                      Copy ID
                    </Button>
                    <Button
                      ref={copyUrlRef}
                      size="xs"
                      variant="ghost-muted"
                      aria-label="Copy task URL"
                      onClick={() => copyUrl.copyToClipboard(taskUrl)}
                    >
                      {copyUrl.isCopied ? <CheckIcon /> : <LinkIcon />}
                      Copy URL
                    </Button>
                  </div>
                </div>
              </div>
              <ClickUpTaskFields details={details} environmentId={environmentId} input={input} />
              <section aria-label="Description" className="space-y-4 border-t border-border pt-6">
                <h3 className="text-sm font-medium">Description</h3>
                <ChatMarkdown
                  text={details.task.description || "No description provided."}
                  cwd={undefined}
                  environmentId={environmentId}
                  threadRef={threadRef}
                />
              </section>
              <ClickUpCustomFields details={details} />
              <ClickUpTaskWork
                environmentId={environmentId}
                threadRef={threadRef}
                input={input}
                details={details}
              />
              <section className="space-y-3 border-t border-border pt-6" aria-label="Attachments">
                <h3 className="flex items-center gap-2 text-sm font-medium">
                  <PaperclipIcon className="size-4" /> Attachments{" "}
                  <span className="text-muted-foreground">{details.attachments.length}</span>
                </h3>
                {!details.attachments.length && (
                  <p className="text-sm text-muted-foreground">No attachments.</p>
                )}
                <ClickUpAttachments
                  attachments={details.attachments}
                  environmentId={environmentId}
                  threadRef={threadRef}
                />
              </section>
              <ClickUpTaskChecklist
                environmentId={environmentId}
                input={input}
                checklists={details.metadata?.checklists ?? []}
                refreshing={result.waiting}
              />
              {Boolean(details.metadata?.subtasks.length) && (
                <section className="space-y-3 border-t border-border pt-6">
                  <h3 className="text-sm font-medium">Subtasks</h3>
                  {details.metadata?.subtasks.map((task) => (
                    <div key={task.id} className="flex items-center justify-between gap-3 text-sm">
                      <ExternalLink
                        url={`https://app.clickup.com/t/${encodeURIComponent(task.id)}`}
                        environmentId={environmentId}
                        threadRef={threadRef}
                        className="min-w-0"
                      >
                        {task.name}
                      </ExternalLink>
                      <span className="shrink-0 text-xs text-muted-foreground">{task.status}</span>
                    </div>
                  ))}
                </section>
              )}
              {Boolean(details.metadata?.relatedTasks.length) && (
                <section className="space-y-3 border-t border-border pt-6">
                  <h3 className="text-sm font-medium">Related tasks</h3>
                  {details.metadata?.relatedTasks.map((task) => (
                    <p key={`${task.id}:${task.label}`} className="text-sm">
                      <ExternalLink
                        url={`https://app.clickup.com/t/${encodeURIComponent(task.id)}`}
                        environmentId={environmentId}
                        threadRef={threadRef}
                      >
                        {task.label} · {task.id}
                      </ExternalLink>
                    </p>
                  ))}
                </section>
              )}
            </div>
          </div>
          <ClickUpTaskActivity
            details={details}
            environmentId={environmentId}
            threadRef={threadRef}
            input={input}
          />
        </div>
      )}
      {action && details && (
        <ClickUpTaskActionDialog
          environmentId={environmentId}
          input={input}
          taskName={details.task.name}
          action={action}
          onClose={() => setAction(null)}
        />
      )}
    </section>
  );
}
