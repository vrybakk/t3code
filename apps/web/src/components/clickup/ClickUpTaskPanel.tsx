import { useAtomValue } from "@effect/atom-react";
import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import type { ClickUpTaskInput, EnvironmentId, ProjectId } from "@t3tools/contracts";
import { Link } from "@tanstack/react-router";
import * as Option from "effect/Option";
import { AsyncResult } from "effect/unstable/reactivity";
import { useState } from "react";
import { useComposerDraftStore } from "../../composerDraftStore";
import { useNewThreadHandler } from "../../hooks/useHandleNewThread";
import { useProjects } from "../../state/entities";
import { serverEnvironment } from "../../state/server";
import { appAtomRegistry } from "../../rpc/atomRegistry";
import ChatMarkdown from "../ChatMarkdown";
import { Button } from "../ui/button";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { buildClickUpTaskPrompt, safeClickUpAttachmentUrl } from "./taskPrompt";

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
  const linksResult = useAtomValue(linksQuery);
  const links = Option.getOrNull(AsyncResult.value(linksResult)) ?? [];
  const projects = useProjects().filter((project) => project.environmentId === environmentId);
  const [projectId, setProjectId] = useState<ProjectId | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const newThread = useNewThreadHandler();
  const selectedProject = projects.find((project) => project.id === projectId);

  async function prepareThread() {
    if (!details || !selectedProject) return;
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
    <section
      aria-label="Task details"
      className="min-w-0 space-y-5 rounded-lg border border-border p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <a
          href={`https://app.clickup.com/t/${encodeURIComponent(input.taskId)}`}
          target="_blank"
          rel="noreferrer"
          className="text-sm text-primary underline"
        >
          Open in ClickUp
        </a>
        <Button
          size="sm"
          variant="outline"
          disabled={result.waiting}
          onClick={() => {
            appAtomRegistry.refresh(query);
            appAtomRegistry.refresh(linksQuery);
          }}
        >
          Refresh task
        </Button>
      </div>
      {AsyncResult.isFailure(result) ? (
        <p role="alert" className="text-sm text-destructive">
          Could not load this task. Check your connection and ClickUp access, then refresh.
        </p>
      ) : !details ? (
        <p role="status" className="text-sm text-muted-foreground">
          Loading task…
        </p>
      ) : (
        <>
          <div>
            <h2 className="text-lg font-medium">{details.task.name}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {details.task.listName} · {details.task.status}
            </p>
          </div>
          <div className="space-y-3 rounded-lg bg-muted/40 p-3">
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
            <Button
              disabled={!selectedProject || busy || result.waiting}
              onClick={() => void prepareThread()}
            >
              Open in coding thread
            </Button>
            <p className="text-xs text-muted-foreground">
              Prepares a task-linked draft with an isolated worktree. Review its model and
              permissions, then send to begin.
            </p>
            {projects.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Add a project in this environment before starting work.
              </p>
            )}
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
          </div>
          {AsyncResult.isFailure(linksResult) && (
            <p role="alert" className="text-sm text-destructive">
              Could not load linked coding threads. Refresh the task to retry.
            </p>
          )}
          {links.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-medium">Coding threads</h3>
              {links.map((link) => (
                <Link
                  key={link.threadId}
                  to="/$environmentId/$threadId"
                  params={{ environmentId, threadId: link.threadId }}
                  className="block truncate text-sm text-primary underline"
                >
                  {link.title}
                </Link>
              ))}
            </div>
          )}
          <ChatMarkdown
            text={details.task.description || "No description provided."}
            cwd={undefined}
            environmentId={environmentId}
          />
          {details.attachments.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-medium">Attachments</h3>
              {details.attachments.map((attachment) => {
                const url = safeClickUpAttachmentUrl(attachment.url);
                return url ? (
                  <a
                    key={attachment.url}
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    className="block break-words text-sm text-primary underline"
                  >
                    {attachment.name}
                  </a>
                ) : (
                  <p key={attachment.url} className="text-sm text-muted-foreground">
                    {attachment.name} — open in ClickUp
                  </p>
                );
              })}
            </div>
          )}
          <div className="space-y-3">
            <h3 className="text-sm font-medium">Recent comments</h3>
            <p className="text-xs text-muted-foreground">
              Newest comments first. Open ClickUp for replies
              {details.commentsMayHaveMore ? " and older comments" : ""}.
            </p>
            {details.comments.length === 0 && (
              <p className="text-sm text-muted-foreground">No comments yet.</p>
            )}
            {details.comments.map((comment) => (
              <article key={comment.id} className="rounded-md border border-border p-3">
                <p className="mb-2 text-xs font-medium">{comment.author}</p>
                <p className="whitespace-pre-wrap break-words text-sm">{comment.text}</p>
              </article>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
