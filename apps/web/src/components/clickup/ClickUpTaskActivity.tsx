import { useAtomValue } from "@effect/atom-react";
import type {
  ClickUpCommentCursor,
  ClickUpCommentsPage,
  ClickUpTaskDetails,
  ClickUpTaskInput,
  EnvironmentId,
} from "@t3tools/contracts";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { AsyncResult, Atom } from "effect/unstable/reactivity";
import {
  MessageSquareIcon,
  PanelRightCloseIcon,
  PanelRightOpenIcon,
  RefreshCwIcon,
} from "lucide-react";
import { useId, useState } from "react";
import { useLocalStorage } from "../../hooks/useLocalStorage";
import { appAtomRegistry } from "../../rpc/atomRegistry";
import { serverEnvironment } from "../../state/server";
import { Button } from "../ui/button";
import { ScrollArea } from "../ui/scroll-area";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { ClickUpCommentThread } from "./ClickUpCommentThread";
import { ClickUpCommentComposer } from "./ClickUpCommentComposer";
import { taskDate } from "./taskFormatting";

const inactiveComments = Atom.make(AsyncResult.initial<ClickUpCommentsPage>());

export function ClickUpTaskActivity({
  details,
  environmentId,
  input,
}: {
  details: ClickUpTaskDetails;
  environmentId: EnvironmentId;
  input: ClickUpTaskInput;
}) {
  const [activityOpen, setActivityOpen] = useLocalStorage(
    "t3code:clickup-activity-open",
    true,
    Schema.Boolean,
  );
  const activityContentId = useId();
  const [cursors, setCursors] = useState<ClickUpCommentCursor[]>([]);
  const [fetchComments, setFetchComments] = useState(false);
  const cursor = cursors.at(-1);
  const query = fetchComments
    ? serverEnvironment.clickUpComments({
        environmentId,
        input: { ...input, ...(cursor ? { cursor } : {}) },
      })
    : inactiveComments;
  const result = useAtomValue(query);
  const lastComment = details.comments.at(-1);
  const nextCursor =
    details.commentsMayHaveMore &&
    lastComment?.createdAt &&
    /^\d{1,20}$/.test(lastComment.createdAt)
      ? { id: lastComment.id, date: lastComment.createdAt }
      : null;
  const page =
    Option.getOrNull(AsyncResult.value(result)) ??
    (cursor ? null : { comments: details.comments, hasMore: nextCursor !== null, nextCursor });
  function refreshComments() {
    appAtomRegistry.refresh(
      fetchComments ? query : serverEnvironment.clickUpComments({ environmentId, input }),
    );
    setFetchComments(true);
  }
  return (
    <aside
      aria-label="Activity and comments"
      className={`flex min-h-0 flex-col border-t border-border bg-muted/10 lg:shrink-0 lg:border-t-0 lg:border-l ${activityOpen ? "lg:w-80 xl:w-96" : "lg:w-12"}`}
    >
      <div
        className={`flex items-center justify-between border-b border-border py-4 ${activityOpen ? "px-5" : "px-2 lg:justify-center"}`}
      >
        <h3
          className={`flex items-center gap-2 text-sm font-medium ${activityOpen ? "" : "lg:hidden"}`}
        >
          <MessageSquareIcon className="size-4" /> Activity & comments
        </h3>
        <div className="flex items-center gap-1">
          {activityOpen && (
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Refresh comments"
              disabled={result.waiting}
              onClick={refreshComments}
            >
              <RefreshCwIcon className="size-4" />
            </Button>
          )}
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label={
                    activityOpen ? "Hide activity and comments" : "Show activity and comments"
                  }
                  aria-expanded={activityOpen}
                  aria-controls={activityContentId}
                  onClick={() => setActivityOpen((open) => !open)}
                />
              }
            >
              {activityOpen ? (
                <PanelRightCloseIcon className="size-4" />
              ) : (
                <PanelRightOpenIcon className="size-4" />
              )}
            </TooltipTrigger>
            <TooltipPopup>
              {activityOpen ? "Hide activity and comments" : "Show activity and comments"}
            </TooltipPopup>
          </Tooltip>
        </div>
      </div>
      <div
        id={activityContentId}
        hidden={!activityOpen}
        className={`${activityOpen ? "flex" : "hidden"} min-h-0 flex-1 flex-col`}
      >
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
                    onRefresh={refreshComments}
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
                    if (nextCursor) {
                      setFetchComments(true);
                      setCursors((current) => [...current, nextCursor]);
                    }
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
              setFetchComments(true);
              appAtomRegistry.refresh(serverEnvironment.clickUpTask({ environmentId, input }));
            }}
          />
        </div>
      </div>
    </aside>
  );
}
