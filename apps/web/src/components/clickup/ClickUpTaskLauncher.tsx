import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import { ProjectId, type ClickUpTaskDetails, type EnvironmentId } from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { useRef, useState } from "react";
import { useComposerDraftStore } from "../../composerDraftStore";
import { useNewThreadHandler } from "../../hooks/useHandleNewThread";
import { useEnvironmentSettings } from "../../hooks/useSettings";
import { useLocalStorage } from "../../hooks/useLocalStorage";
import { useClickUpRepositories } from "./useClickUpRepositories";
import { ClickUpRepositoryClone } from "./ClickUpRepositoryClone";
import { ClickUpRepositoryMappings } from "./ClickUpRepositoryMappings";
import { CircleCheckIcon, FolderGit2Icon } from "lucide-react";
import { Spinner } from "../ui/spinner";
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
    localCheckouts,
    checking,
    discoveryFailed,
    retryDiscovery,
  } = useClickUpRepositories(details.task, environmentId);
  const repositoriesUnavailable =
    checking || discoveryFailed || missing.length > 0 || unavailableLocalIds.length > 0;
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
        envMode: localCheckouts.some(
          (checkout) =>
            checkout.projectId === selectedProject.id &&
            checkout.cwd !== selectedProject.workspaceRoot,
        )
          ? "local"
          : "worktree",
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
          ].flatMap((project) => [
            { id: project.id, title: project.title, cwd: project.workspaceRoot },
            ...localCheckouts
              .filter(
                (checkout) =>
                  checkout.projectId === project.id && checkout.cwd !== project.workspaceRoot,
              )
              .map((checkout) => ({
                id: project.id,
                title: checkout.cwd.split(/[\\/]/).at(-1) ?? project.title,
                cwd: checkout.cwd,
              })),
          ]),
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
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-muted-foreground">Workspace</span>
          {mapping && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setShowAllRepositories((value) => !value)}
            >
              {showAllRepositories ? "Show linked repositories" : "Show all repositories"}
            </Button>
          )}
        </div>
        <Select
          value={selectedProject?.id ?? null}
          onValueChange={(value) => setProjectId(value as ProjectId | null)}
          disabled={busy}
          items={availableProjects.map((project) => ({ value: project.id, label: project.title }))}
        >
          <SelectTrigger aria-label="Workspace">
            <SelectValue placeholder="Choose a workspace" />
          </SelectTrigger>
          <SelectPopup>
            {availableProjects.map((project) => (
              <SelectItem key={project.id} value={project.id}>
                {project.title}
              </SelectItem>
            ))}
          </SelectPopup>
        </Select>
        {selectedProject && (
          <p className="flex items-start gap-2 text-xs text-muted-foreground">
            <FolderGit2Icon aria-hidden className="size-4 shrink-0" />
            <span className="break-all">{selectedProject.workspaceRoot}</span>
          </p>
        )}
      </div>
      {checking ? (
        <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner size="sm" />
          Checking existing repository folders…
        </p>
      ) : discoveryFailed ? (
        <div role="alert" className="space-y-2 text-sm">
          <p>Could not check existing folders.</p>
          <Button size="sm" variant="outline" onClick={retryDiscovery}>
            Retry check
          </Button>
        </div>
      ) : repositoriesUnavailable ? (
        <div className="space-y-3 rounded-lg border p-3">
          <p className="text-sm font-medium">Some linked repositories aren’t available locally</p>
          <p className="text-xs text-muted-foreground">
            Manage links to correct the mapping, or download the missing repository.
          </p>
          {missing.map((repository) => (
            <ClickUpRepositoryClone
              key={repository.remoteUrl}
              repository={repository}
              task={details.task}
              environmentId={environmentId}
            />
          ))}
          {unavailableLocalIds.length > 0 && (
            <p className="text-xs text-muted-foreground">
              A linked workspace is unavailable or its download has not finished.
            </p>
          )}
        </div>
      ) : (
        selectedProject && (
          <p role="status" className="flex items-center gap-2 text-sm">
            <CircleCheckIcon aria-hidden className="size-4 text-success-foreground" />
            {localCheckouts.some((checkout) => checkout.projectId === selectedProject.id)
              ? "Existing repositories found in this workspace"
              : "Workspace ready"}
          </p>
        )
      )}
      {mapping && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">
            Linked to {mapping.sources.map((source) => source.name).join(", ")}
          </span>
          <ClickUpRepositoryMappings task={details.task} environmentId={environmentId} />
        </div>
      )}
      {blocked && (
        <p role="alert" className="text-sm text-destructive">
          Remove the no agent tag to allow implementation.
        </p>
      )}
      {!projects.length && (
        <p className="text-sm text-muted-foreground">Add a project to start a coding thread.</p>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center justify-end gap-3 border-t pt-4">
        <p className="min-w-48 flex-1 text-xs text-muted-foreground">
          Opens a prepared thread. Review it, then send to start.
        </p>
        <Button
          disabled={!selectedProject || busy || blocked || repositoriesUnavailable}
          onClick={() => void prepareThread()}
        >
          {busy ? "Preparing…" : "Prepare thread"}
        </Button>
      </div>
    </div>
  );
}
