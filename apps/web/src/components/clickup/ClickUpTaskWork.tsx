import { useAtomValue } from "@effect/atom-react";
import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import type {
  ClickUpTaskDetails,
  ClickUpTaskInput,
  EnvironmentId,
  ProjectId,
} from "@t3tools/contracts";
import { visibleThreadPullRequests } from "@t3tools/shared/threadPullRequests";
import { Link } from "@tanstack/react-router";
import * as Option from "effect/Option";
import { AsyncResult } from "effect/unstable/reactivity";
import { MessageSquareIcon } from "lucide-react";
import { useState } from "react";
import { useComposerDraftStore } from "../../composerDraftStore";
import { useNewThreadHandler } from "../../hooks/useHandleNewThread";
import { useOpenChangeRequestLink } from "../../lib/openPullRequestLink";
import { useProjects, useThreadShells } from "../../state/entities";
import { serverEnvironment } from "../../state/server";
import { Badge } from "../ui/badge";
import { PullRequestGlyph } from "../pullRequest/pullRequestIcons";
import { Button } from "../ui/button";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { buildClickUpTaskPrompt, safeClickUpAttachmentUrl } from "./taskPrompt";

export function ClickUpTaskWork({
  environmentId,
  input,
  details,
}: {
  environmentId: EnvironmentId;
  input: ClickUpTaskInput;
  details: ClickUpTaskDetails;
}) {
  const linksResult = useAtomValue(serverEnvironment.clickUpThreads({ environmentId, input }));
  const links = Option.getOrNull(AsyncResult.value(linksResult)) ?? [];
  const projects = useProjects().filter((project) => project.environmentId === environmentId);
  const shells = useThreadShells();
  const openPr = useOpenChangeRequestLink();
  const pullRequests = [
    ...new Map(
      links.flatMap((link) => {
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
  const [projectId, setProjectId] = useState<ProjectId | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const newThread = useNewThreadHandler();
  const selectedProject = projects.find((project) => project.id === projectId);
  async function prepareThread() {
    if (!selectedProject) return;
    setBusy(true);
    setError(null);
    try {
      const draft = await newThread(scopeProjectRef(environmentId, selectedProject.id), {
        envMode: "worktree",
      });
      if (!draft) return;
      const store = useComposerDraftStore.getState();
      store.setDraftThreadContext(draft.draftId, {
        clickUpTask: {
          taskId: details.task.taskId,
          workspaceId: details.task.workspaceId,
          name: details.task.name,
        },
        environmentSelection: "manual",
      });
      store.setPrompt(draft.draftId, buildClickUpTaskPrompt(details));
    } catch {
      setError("Could not prepare the coding thread. Try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="space-y-4 border-t border-border pt-6" aria-label="Linked work">
      <h3 className="flex items-center gap-2 text-sm font-medium">
        Linked work <Badge variant="secondary">Nerd</Badge>
      </h3>
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
                    <a
                      key={pr.url}
                      href={pr.url}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(event) => openPr(event, pr.url, undefined, environmentId)}
                      className="block truncate text-primary hover:underline"
                    >
                      {pr.repository} #{pr.number}
                    </a>
                  ) : null,
                )
              ) : (
                <span className="text-muted-foreground">No PRs linked to these threads</span>
              )}
            </dd>
          </div>
        </dl>
      )}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/20 p-3">
        <div className="min-w-48 flex-1">
          <Select
            value={projectId}
            onValueChange={(value) => setProjectId(value as ProjectId | null)}
            items={projects.map((project) => ({ value: project.id, label: project.title }))}
          >
            <SelectTrigger aria-label="Repository project">
              <SelectValue placeholder="Choose a project" />
            </SelectTrigger>
            <SelectPopup>
              {projects.map((project) => (
                <SelectItem key={project.id} value={project.id}>
                  {project.title}
                </SelectItem>
              ))}
            </SelectPopup>
          </Select>
        </div>
        <Button size="sm" disabled={!selectedProject || busy} onClick={() => void prepareThread()}>
          Open in coding thread
        </Button>
        <p className="w-full text-xs text-muted-foreground">
          Prepare a linked draft to review before starting work.
        </p>
        {!projects.length && (
          <p className="text-xs text-muted-foreground">Add a project to start a coding thread.</p>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </div>
    </section>
  );
}
