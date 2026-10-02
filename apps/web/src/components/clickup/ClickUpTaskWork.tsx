import { useAtomRefresh, useAtomValue } from "@effect/atom-react";
import type {
  ClickUpTaskDetails,
  ClickUpTaskInput,
  EnvironmentId,
  ScopedThreadRef,
} from "@t3tools/contracts";
import { visibleThreadPullRequests } from "@t3tools/shared/threadPullRequests";
import { Link } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import * as Option from "effect/Option";
import { AsyncResult } from "effect/unstable/reactivity";
import { MessageSquareIcon } from "lucide-react";
import { useThreadShells } from "../../state/entities";
import { serverEnvironment } from "../../state/server";
import { ExternalLink } from "../ExternalLink";
import { Badge } from "../ui/badge";
import { PullRequestGlyph } from "../pullRequest/pullRequestIcons";
import { safeClickUpAttachmentUrl } from "./taskPrompt";
import { ClickUpTaskHandoffs } from "./ClickUpTaskHandoffs";
import { ClickUpLinkedRepositories } from "./ClickUpLinkedRepositories";

export function ClickUpTaskWork({
  environmentId,
  threadRef,
  input,
  details,
}: {
  environmentId: EnvironmentId;
  threadRef: ScopedThreadRef | undefined;
  input: ClickUpTaskInput;
  details: ClickUpTaskDetails;
}) {
  const linksAtom = serverEnvironment.clickUpThreads({ environmentId, input });
  const linksResult = useAtomValue(linksAtom);
  const refreshLinks = useAtomRefresh(linksAtom);
  const links = Option.getOrNull(AsyncResult.value(linksResult)) ?? [];
  const shells = useThreadShells();
  const taskLinkRevision = shells
    .filter((shell) => shell.environmentId === environmentId)
    .flatMap((shell) =>
      (shell.clickUpTasks ?? [])
        .filter((task) => task.workspaceId === input.workspaceId && task.taskId === input.taskId)
        .map((task) => `${shell.id}:${task.primary}:${shell.title}`),
    )
    .sort()
    .join("|");
  const previousLinks = useRef<{ atom: typeof linksAtom; revision: string } | null>(null);
  useEffect(() => {
    const previous = previousLinks.current;
    previousLinks.current = { atom: linksAtom, revision: taskLinkRevision };
    if (previous?.atom !== linksAtom || previous.revision !== taskLinkRevision) refreshLinks();
  }, [taskLinkRevision, linksAtom, refreshLinks]);
  const pullRequests = [
    ...new Map(
      links
        .filter((link) => link.role !== "context")
        .flatMap((link) => {
          const thread = shells.find(
            (shell) => shell.environmentId === environmentId && shell.id === link.threadId,
          );
          if (!thread) return [];
          const current = visibleThreadPullRequests(thread.pullRequests);
          const prs = current.length
            ? current
            : thread.linkedPullRequest
              ? [thread.linkedPullRequest]
              : [];
          return prs.map((pr) => [pr.url, { ...pr, threadId: link.threadId }] as const);
        }),
    ).values(),
  ];
  return (
    <section className="space-y-4 border-t border-border pt-6" aria-label="Linked work">
      <h3 className="flex items-center gap-2 text-sm font-medium">
        Linked work <Badge variant="secondary">Nerd</Badge>
      </h3>
      <ClickUpLinkedRepositories
        task={details.task}
        environmentId={environmentId}
        threadRef={threadRef}
      />
      {AsyncResult.isFailure(linksResult) ? (
        <p role="alert" className="text-sm text-destructive">
          Could not load linked work. Refresh the task to retry.
        </p>
      ) : linksResult.waiting && !links.length ? (
        <p role="status" className="text-sm text-muted-foreground">
          Loading linked work…
        </p>
      ) : (
        <dl className="space-y-4 text-sm">
          <div className="grid grid-cols-[8rem_1fr] gap-3">
            <dt className="flex items-start gap-2 text-muted-foreground">
              <MessageSquareIcon className="mt-0.5 size-4" /> Threads
            </dt>
            <dd className="min-w-0 space-y-2">
              {links.length ? (
                links.map((link) => (
                  <Link
                    key={link.threadId}
                    to="/$environmentId/$threadId"
                    params={{ environmentId, threadId: link.threadId }}
                    className="block truncate text-primary hover:underline"
                  >
                    {link.title}
                  </Link>
                ))
              ) : (
                <span className="text-muted-foreground">No linked threads</span>
              )}
            </dd>
          </div>
          <div className="grid grid-cols-[8rem_1fr] gap-3">
            <dt className="flex items-start gap-2 text-muted-foreground">
              <PullRequestGlyph.pullRequest className="mt-0.5 size-4" /> Pull requests
            </dt>
            <dd className="min-w-0 space-y-2">
              {pullRequests.length ? (
                pullRequests.map((pr) =>
                  safeClickUpAttachmentUrl(pr.url) ? (
                    <p key={pr.url} className="truncate">
                      <ExternalLink
                        url={pr.url}
                        environmentId={environmentId}
                        threadRef={threadRef}
                      >
                        {pr.repository} #{pr.number}
                      </ExternalLink>
                    </p>
                  ) : null,
                )
              ) : (
                <span className="text-muted-foreground">No PRs linked to these threads</span>
              )}
            </dd>
          </div>
        </dl>
      )}
      <ClickUpTaskHandoffs environmentId={environmentId} input={input} />
    </section>
  );
}
