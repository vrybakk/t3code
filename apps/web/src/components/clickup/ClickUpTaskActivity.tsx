import type { ClickUpTaskDetails } from "@t3tools/contracts";
import { MessageSquareIcon } from "lucide-react";
import { ScrollArea } from "../ui/scroll-area";
import { taskDate } from "./taskFormatting";

export function ClickUpTaskActivity({ details }: { details: ClickUpTaskDetails }) {
  return (
    <aside
      aria-label="Activity and comments"
      className="flex min-h-0 flex-col border-t border-border bg-muted/10 lg:w-80 lg:shrink-0 lg:border-t-0 lg:border-l xl:w-96"
    >
      <div className="border-b border-border px-5 py-4">
        <h3 className="flex items-center gap-2 text-sm font-medium">
          <MessageSquareIcon className="size-4" /> Activity & comments
        </h3>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-4 p-5">
          <p className="text-xs leading-relaxed text-muted-foreground">
            Latest comments. Full change history and replies are available in ClickUp.
          </p>
          {details.metadata?.createdAt && (
            <p className="text-xs leading-relaxed text-muted-foreground">
              {details.metadata.creator?.username ?? "Someone"} created this task ·{" "}
              {taskDate(details.metadata.createdAt)}
            </p>
          )}
          {!details.comments.length && (
            <div className="rounded-lg border border-dashed border-border p-5 text-center text-sm text-muted-foreground">
              No comments yet.
            </div>
          )}
          {details.comments.map((comment) => (
            <article
              key={comment.id}
              className="space-y-3 rounded-lg border border-border bg-background p-3"
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
              <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
                {comment.text}
              </p>
              {Boolean(comment.replyCount) && (
                <p className="border-t border-border pt-2 text-xs text-muted-foreground">
                  {comment.replyCount} replies · Open in ClickUp
                </p>
              )}
            </article>
          ))}
          {details.commentsMayHaveMore && (
            <a
              href={`https://app.clickup.com/t/${encodeURIComponent(details.task.taskId)}`}
              target="_blank"
              rel="noreferrer"
              className="block text-xs text-primary hover:underline"
            >
              Read older comments in ClickUp
            </a>
          )}
        </div>
      </ScrollArea>
    </aside>
  );
}
