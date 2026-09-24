import { useAtomValue } from "@effect/atom-react";
import type {
  ClickUpComment,
  ClickUpCommentCursor,
  ClickUpTaskDetails,
  ClickUpTaskInput,
  EnvironmentId,
} from "@t3tools/contracts";
import * as Option from "effect/Option";
import { AsyncResult } from "effect/unstable/reactivity";
import { CheckIcon, MessageSquareIcon, RefreshCwIcon } from "lucide-react";
import { useState } from "react";
import { cn } from "../../lib/utils";
import { appAtomRegistry } from "../../rpc/atomRegistry";
import { serverEnvironment } from "../../state/server";
import { useAtomCommand } from "../../state/use-atom-command";
import { Button } from "../ui/button";
import { ScrollArea } from "../ui/scroll-area";
import { ClickUpAttachments } from "./ClickUpAttachments";
import { taskDate } from "./taskFormatting";

export function ClickUpTaskActivity({
  details,
  environmentId,
  input,
}: {
  details: ClickUpTaskDetails;
  environmentId: EnvironmentId;
  input: ClickUpTaskInput;
}) {
  const [cursors, setCursors] = useState<ClickUpCommentCursor[]>([]);
  const cursor = cursors.at(-1);
  const query = serverEnvironment.clickUpComments({
    environmentId,
    input: { ...input, ...(cursor ? { cursor } : {}) },
  });
  const result = useAtomValue(query);
  const page = Option.getOrNull(AsyncResult.value(result));
  return (
    <aside
      aria-label="Activity and comments"
      className="flex min-h-0 flex-col border-t border-border bg-muted/10 lg:w-80 lg:shrink-0 lg:border-t-0 lg:border-l xl:w-96"
    >
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <h3 className="flex items-center gap-2 text-sm font-medium">
          <MessageSquareIcon className="size-4" /> Activity & comments
        </h3>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="Refresh comments"
          disabled={result.waiting}
          onClick={() => appAtomRegistry.refresh(query)}
        >
          <RefreshCwIcon className="size-4" />
        </Button>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-4 p-5">
          <p className="text-xs leading-relaxed text-muted-foreground">
            Full change history and comment replies are available in ClickUp.
          </p>
          {!cursor && details.metadata?.createdAt && (
            <p className="text-xs leading-relaxed text-muted-foreground">
              {details.metadata.creator?.username ?? "Someone"} created this task ·{" "}
              {taskDate(details.metadata.createdAt)}
            </p>
          )}
          {AsyncResult.isFailure(result) ? (
            <p role="alert" className="text-sm text-destructive">
              Could not load comments. Refresh to try again.
            </p>
          ) : !page ? (
            <p role="status" className="text-sm text-muted-foreground">
              Loading comments…
            </p>
          ) : (
            <>
              {!page.comments.length && (
                <div className="rounded-lg border border-dashed border-border p-5 text-center text-sm text-muted-foreground">
                  {cursor ? "No older comments." : "No comments yet."}
                </div>
              )}
              {page.comments.map((comment) => (
                <CommentCard
                  key={comment.id}
                  comment={comment}
                  environmentId={environmentId}
                  input={input}
                  cursor={cursor}
                  refreshing={result.waiting}
                  onRefresh={() => appAtomRegistry.refresh(query)}
                />
              ))}
            </>
          )}
          {(cursor || page?.hasMore) && (
            <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
              <Button
                size="sm"
                variant="outline"
                disabled={!cursor || result.waiting}
                onClick={() => setCursors((current) => current.slice(0, -1))}
              >
                Newer
              </Button>
              <span className="text-xs text-muted-foreground">Page {cursors.length + 1}</span>
              <Button
                size="sm"
                variant="outline"
                disabled={!page?.nextCursor || result.waiting || AsyncResult.isFailure(result)}
                onClick={() => {
                  const nextCursor = page?.nextCursor;
                  if (nextCursor) setCursors((current) => [...current, nextCursor]);
                }}
              >
                Older
              </Button>
            </div>
          )}
        </div>
      </ScrollArea>
    </aside>
  );
}

function CommentCard({
  comment,
  environmentId,
  input,
  cursor,
  refreshing,
  onRefresh,
}: {
  comment: ClickUpComment;
  environmentId: EnvironmentId;
  input: ClickUpTaskInput;
  cursor: ClickUpCommentCursor | undefined;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const update = useAtomCommand(serverEnvironment.clickUpSetCommentResolution);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const assignedToMe = comment.assignee?.id === input.userId;
  const mentionsMe = comment.mentionedUserIds?.includes(input.userId) === true;
  async function toggle() {
    setBusy(true);
    setError(null);
    try {
      const result = await update({
        environmentId,
        input: {
          ...input,
          commentId: comment.id,
          resolved: !comment.resolved,
          ...(cursor ? { cursor } : {}),
        },
      });
      if (result._tag === "Success") {
        onRefresh();
        appAtomRegistry.refresh(serverEnvironment.clickUpTask({ environmentId, input }));
      } else
        setError(
          "Could not update this comment. Refresh comments to check its state, then try again.",
        );
    } finally {
      setBusy(false);
    }
  }
  return (
    <article
      className={cn(
        "space-y-3 rounded-lg border border-border bg-background p-3",
        (assignedToMe || mentionsMe) &&
          "border-primary/30 bg-linear-to-br from-primary/10 to-background",
      )}
    >
      <div className="flex items-center gap-2">
        <span
          aria-hidden
          className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium"
        >
          {comment.author.slice(0, 1).toUpperCase()}
        </span>
        <div className="min-w-0">
          <p className="truncate text-xs font-medium">{comment.author}</p>
          {comment.createdAt && (
            <p className="text-xs text-muted-foreground">{taskDate(comment.createdAt)}</p>
          )}
        </div>
      </div>
      {(assignedToMe || mentionsMe) && (
        <p className="text-xs font-medium text-primary">
          {assignedToMe ? "Assigned to you" : "Mentions you"}
        </p>
      )}
      <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{comment.text}</p>
      {!!comment.attachments?.length && <ClickUpAttachments attachments={comment.attachments} />}
      {comment.assignee && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
          <p className="min-w-0 text-xs text-muted-foreground">
            Assigned to{" "}
            <span className="text-foreground">
              {comment.assignee.username}
              {comment.assignee.id === input.userId ? " (you)" : ""}
            </span>
          </p>
          <Button
            size="sm"
            variant={comment.resolved ? "ghost" : "outline"}
            disabled={busy || refreshing}
            onClick={() => void toggle()}
          >
            {busy ? (
              "Saving…"
            ) : comment.resolved ? (
              <>
                <CheckIcon className="size-3.5" /> Reopen
              </>
            ) : (
              "Resolve"
            )}
          </Button>
        </div>
      )}
      {comment.resolved && <p className="text-xs text-success">Resolved</p>}
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
      {Boolean(comment.replyCount) && (
        <a
          href={`https://app.clickup.com/t/${encodeURIComponent(input.taskId)}`}
          target="_blank"
          rel="noreferrer"
          className="block border-t border-border pt-2 text-xs text-primary hover:underline"
        >
          {comment.replyCount} replies · Open in ClickUp
        </a>
      )}
    </article>
  );
}
