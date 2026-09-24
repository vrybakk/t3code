import { useAtomValue } from "@effect/atom-react";
import type {
  ClickUpCommentCursor,
  ClickUpTaskDetails,
  ClickUpTaskInput,
  EnvironmentId,
} from "@t3tools/contracts";
import * as Option from "effect/Option";
import { AsyncResult } from "effect/unstable/reactivity";
import { MessageSquareIcon, RefreshCwIcon } from "lucide-react";
import { useState } from "react";
import { appAtomRegistry } from "../../rpc/atomRegistry";
import { serverEnvironment } from "../../state/server";
import { Button } from "../ui/button";
import { ScrollArea } from "../ui/scroll-area";
import { ClickUpCommentThread } from "./ClickUpCommentThread";
import { ClickUpCommentComposer } from "./ClickUpCommentComposer";
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
            Full change history is available in ClickUp.
          </p>
          {!cursor && details.metadata?.createdAt && (
            <p className="text-xs leading-relaxed text-muted-foreground">
              {details.metadata.creator?.username ?? "Someone"} created this task ·{" "}
              {taskDate(details.metadata.createdAt)}
            </p>
          )}
          {AsyncResult.isFailure(result) && (
            <p role="alert" className="text-sm text-destructive">
              Could not load comments. Refresh to try again.
            </p>
          )}
          {!page ? (
            !AsyncResult.isFailure(result) && (
              <p role="status" className="text-sm text-muted-foreground">
                Loading comments…
              </p>
            )
          ) : (
            <>
              {!page.comments.length && (
                <div className="rounded-lg border border-dashed border-border p-5 text-center text-sm text-muted-foreground">
                  {cursor ? "No older comments." : "No comments yet."}
                </div>
              )}
              {page.comments.map((comment) => (
                <ClickUpCommentThread
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
      <div className="shrink-0 border-t border-border p-4">
        <ClickUpCommentComposer
          environmentId={environmentId}
          input={input}
          onSent={() => {
            setCursors([]);
            appAtomRegistry.refresh(serverEnvironment.clickUpComments({ environmentId, input }));
            appAtomRegistry.refresh(serverEnvironment.clickUpTask({ environmentId, input }));
          }}
        />
      </div>
    </aside>
  );
}
