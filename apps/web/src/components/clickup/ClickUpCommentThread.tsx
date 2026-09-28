import { useAtomValue } from "@effect/atom-react";
import type {
  ClickUpComment,
  ClickUpCommentCursor,
  ClickUpCommentRepliesInput,
  ClickUpTaskInput,
  EnvironmentId,
} from "@t3tools/contracts";
import * as Option from "effect/Option";
import { AsyncResult } from "effect/unstable/reactivity";
import { useId, useState } from "react";
import { appAtomRegistry } from "../../rpc/atomRegistry";
import { serverEnvironment } from "../../state/server";
import { useAtomCommand } from "../../state/use-atom-command";
import { Button } from "../ui/button";
import { ClickUpCommentCard } from "./ClickUpCommentCard";
import { ClickUpCommentComposer } from "./ClickUpCommentComposer";

export function ClickUpCommentThread({
  comment,
  username,
  environmentId,
  input,
  cursor,
  refreshing,
  onRefresh,
}: {
  comment: ClickUpComment;
  username: string | undefined;
  environmentId: EnvironmentId;
  input: ClickUpTaskInput;
  cursor: ClickUpCommentCursor | undefined;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const update = useAtomCommand(serverEnvironment.clickUpSetCommentResolution);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<boolean | null>(null);
  const panelId = useId();
  const replyInput = { ...input, commentId: comment.id, ...(cursor ? { cursor } : {}) };
  async function toggle() {
    setBusy(true);
    setError(null);
    try {
      const result = await update({
        environmentId,
        input: { ...replyInput, resolved: !comment.resolved },
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
    <ClickUpCommentCard
      comment={comment}
      userId={input.userId}
      username={username}
      resolution={{ busy, refreshing, error, toggle: () => void toggle() }}
    >
      <div className="border-t border-border pt-2">
        <Button
          variant="ghost"
          size="sm"
          aria-expanded={expanded === true}
          aria-controls={panelId}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded
            ? "Hide replies"
            : comment.replyCount
              ? `${comment.replyCount} ${comment.replyCount === 1 ? "reply" : "replies"} · Reply`
              : "Reply"}
        </Button>
      </div>
      <div id={panelId} hidden={!expanded}>
        {expanded !== null && (
          <Replies
            environmentId={environmentId}
            input={replyInput}
            username={username}
            onSent={() => {
              onRefresh();
              appAtomRegistry.refresh(serverEnvironment.clickUpTask({ environmentId, input }));
            }}
          />
        )}
      </div>
    </ClickUpCommentCard>
  );
}

function Replies({
  environmentId,
  input,
  username,
  onSent,
}: {
  environmentId: EnvironmentId;
  input: ClickUpCommentRepliesInput;
  username: string | undefined;
  onSent: () => void;
}) {
  const query = serverEnvironment.clickUpCommentReplies({ environmentId, input });
  const result = useAtomValue(query);
  const data = Option.getOrNull(AsyncResult.value(result));
  return (
    <section aria-label="Comment replies" className="space-y-3 border-l-2 border-border pl-3">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-xs font-medium">Replies{data ? ` · ${data.comments.length}` : ""}</h4>
        <Button
          variant="ghost"
          size="sm"
          disabled={result.waiting}
          onClick={() => appAtomRegistry.refresh(query)}
        >
          Refresh replies
        </Button>
      </div>
      {AsyncResult.isFailure(result) ? (
        <p role="alert" className="text-xs text-destructive">
          Could not load replies. Refresh to try again.
        </p>
      ) : !data ? (
        <p role="status" className="text-xs text-muted-foreground">
          Loading replies…
        </p>
      ) : (
        data.comments.map((reply) => (
          <ClickUpCommentCard
            key={reply.id}
            comment={reply}
            userId={input.userId}
            username={username}
          />
        ))
      )}
      <ClickUpCommentComposer
        environmentId={environmentId}
        input={input}
        replyTo={input}
        onSent={() => {
          appAtomRegistry.refresh(query);
          onSent();
        }}
      />
    </section>
  );
}
