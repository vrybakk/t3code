import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import { ProjectId, type ClickUpTaskDetails, type EnvironmentId } from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { useRef, useState } from "react";
import { useComposerDraftStore } from "../../composerDraftStore";
import { useNewThreadHandler } from "../../hooks/useHandleNewThread";
import { useEnvironmentSettings } from "../../hooks/useSettings";
import { useLocalStorage } from "../../hooks/useLocalStorage";
import { useClickUpRepositories } from "./useClickUpRepositories";
import { ClickUpLinkedRepositories } from "./ClickUpLinkedRepositories";
import { Button } from "../ui/button";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { buildClickUpTaskPrompt } from "./taskPrompt";
import {
  clickUpLaunchProjectStorageKey,
  resolveClickUpLaunchProject,
} from "./taskProjectSelection";

const SavedProjectId = Schema.NullOr(ProjectId);

export function ClickUpTaskLauncher({
  environmentId,
  details,
}: {
  environmentId: EnvironmentId;
  details: ClickUpTaskDetails;
}) {
  const {
    mapping,
    mappedProjects,
    allProjects: projects,
    missing,
    unavailableLocalIds,
  } = useClickUpRepositories(details.task, environmentId);
  const repositoriesUnavailable = missing.length > 0 || unavailableLocalIds.length > 0;
  const defaults = useEnvironmentSettings(
    environmentId,
    (settings) => settings.clickUpWorkflowModels,
  );
  const blocked = details.task.tags?.some((tag) => tag.trim().toLowerCase() === "no agent");
  const [showAllRepositories, setShowAllRepositories] = useState(false);
  const [projectId, setProjectId] = useLocalStorage(
    clickUpLaunchProjectStorageKey(details.task, environmentId),
    null,
    SavedProjectId,
  );
  const availableProjects =
    mapping && !showAllRepositories
      ? projects.filter(
          (project) =>
            project.id === projectId || mappedProjects.some((mapped) => mapped.id === project.id),
        )
      : projects;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const newThread = useNewThreadHandler();
  const selectedProject = resolveClickUpLaunchProject(
    details.task,
    availableProjects,
    mappedProjects,
    projectId,
  );
  const launching = useRef(false);
  async function prepareThread() {
    if (!selectedProject || launching.current || blocked || repositoriesUnavailable) return;
    launching.current = true;
    setBusy(true);
    setError(null);
    try {
      const draft = await newThread(scopeProjectRef(environmentId, selectedProject.id), {
        envMode: "worktree",
      });
      if (!draft) return;
      const store = useComposerDraftStore.getState();
      const interactionMode = "default";
      store.setInteractionMode(draft.draftId, interactionMode);
      store.setDraftThreadContext(draft.draftId, {
        clickUpTask: {
          taskId: details.task.taskId,
          workspaceId: details.task.workspaceId,
          name: details.task.name,
        },
        environmentSelection: "manual",
        interactionMode,
      });
      store.setPrompt(
        draft.draftId,
        buildClickUpTaskPrompt(details, {
          models: defaults,
          repositories: [
            ...new Map(
              [...mappedProjects, selectedProject].map((project) => [project.id, project]),
            ).values(),
          ].map((project) => ({
            id: project.id,
            title: project.title,
            cwd: project.workspaceRoot,
          })),
        }),
      );
    } catch {
      setError("Could not prepare the coding thread. Try again.");
    } finally {
      launching.current = false;
      setBusy(false);
    }
  }
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/20 p-3">
      <div className="min-w-48 flex-1">
        <Select
          value={selectedProject?.id ?? null}
          onValueChange={(value) => setProjectId(value as ProjectId | null)}
          disabled={busy}
          items={availableProjects.map((project) => ({
            value: project.id,
            label: project.title,
          }))}
        >
          <SelectTrigger aria-label="Repository project">
            <SelectValue placeholder="Choose a project" />
          </SelectTrigger>
          <SelectPopup>
            {availableProjects.map((project) => (
              <SelectItem key={project.id} value={project.id}>
                {project.title}
              </SelectItem>
            ))}
          </SelectPopup>
        </Select>
      </div>
      <Button
        size="sm"
        disabled={!selectedProject || busy || blocked || repositoriesUnavailable}
        onClick={() => void prepareThread()}
      >
        {busy ? "Preparing…" : "Prepare thread"}
      </Button>
      {mapping && (
        <div className="flex w-full flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>
            Linked to {mapping.sources.map((source) => source.name).join(", ")} ·{" "}
            {mappedProjects.length} repositories
          </span>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setShowAllRepositories((value) => !value)}
          >
            {showAllRepositories ? "Show linked repositories" : "Show all repositories"}
          </Button>
        </div>
      )}
      {repositoriesUnavailable && (
        <div className="w-full space-y-2">
          <p className="text-sm text-muted-foreground">
            Set up the linked repositories before preparing this task.
          </p>
          <ClickUpLinkedRepositories task={details.task} environmentId={environmentId} />
        </div>
      )}
      {blocked && (
        <p role="alert" className="w-full text-sm text-muted-foreground">
          Remove the no agent tag to allow implementation.
        </p>
      )}
      <p className="w-full text-xs text-muted-foreground">
        Review the task request, model and permissions in the thread, then send it to start.
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
  );
}
