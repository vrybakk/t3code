import type { ClickUpComment, EnvironmentId, ScopedThreadRef } from "@t3tools/contracts";
import { useMemo, type ReactNode } from "react";
import { CheckIcon } from "lucide-react";
import type { Options as ReactMarkdownOptions } from "react-markdown";
import { cn } from "../../lib/utils";
import ChatMarkdown from "../ChatMarkdown";
import { Button } from "../ui/button";
import { ClickUpAttachments } from "./ClickUpAttachments";
import { taskDate } from "./taskFormatting";
import { commentLinkedMedia } from "./commentMedia";
import { remarkSelfMentions } from "./commentMentions";

export function ClickUpCommentCard({
  comment,
  userId,
  username,
  environmentId,
  threadRef,
  resolution,
  children,
}: {
  comment: ClickUpComment;
  userId: number;
  username: string | undefined;
  environmentId: EnvironmentId;
  /** Thread the task is open beside, so comment links can open in its integrated browser. */
  threadRef: ScopedThreadRef | undefined;
  resolution?: { busy: boolean; refreshing: boolean; error: string | null; toggle: () => void };
  children?: ReactNode;
}) {
  const assignedToMe = comment.assignee?.id === userId;
  const mentionsMe = comment.mentionedUserIds?.includes(userId) === true;
  const mentionPlugins = useMemo<NonNullable<ReactMarkdownOptions["remarkPlugins"]>>(
    () => [[remarkSelfMentions, { username }]],
    [username],
  );
  const attachments = useMemo(
    () => [
      ...(comment.attachments ?? []),
      ...commentLinkedMedia(comment.text, comment.attachments),
    ],
    [comment.attachments, comment.text],
  );
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
      <ChatMarkdown
        text={comment.text}
        cwd={undefined}
        environmentId={environmentId}
        threadRef={threadRef}
        lineBreaks
        parseRawHtml={false}
        extraRemarkPlugins={mentionPlugins}
      />
      {!!attachments.length && (
        <ClickUpAttachments
          attachments={attachments}
          environmentId={environmentId}
          threadRef={threadRef}
        />
      )}
      {comment.assignee && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
          <p className="min-w-0 text-xs text-muted-foreground">
            Assigned to{" "}
            <span className="text-foreground">
              {comment.assignee.username}
              {assignedToMe ? " (you)" : ""}
            </span>
          </p>
          {resolution && (
            <Button
              size="sm"
              variant={comment.resolved ? "ghost" : "outline"}
              disabled={resolution.busy || resolution.refreshing}
              onClick={resolution.toggle}
            >
              {resolution.busy ? (
                "Saving…"
              ) : comment.resolved ? (
                <>
                  <CheckIcon className="size-3.5" /> Reopen
                </>
              ) : (
                "Resolve"
              )}
            </Button>
          )}
        </div>
      )}
      {comment.resolved && <p className="text-xs text-success">Resolved</p>}
      {resolution?.error && (
        <p role="alert" className="text-xs text-destructive">
          {resolution.error}
        </p>
      )}
      {children}
    </article>
  );
}
