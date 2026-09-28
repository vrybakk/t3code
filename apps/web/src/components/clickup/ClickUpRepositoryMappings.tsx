import type {
  ClickUpRepositoryLink,
  ClickUpTask,
  EnvironmentId,
  ProjectId,
} from "@t3tools/contracts";
import { useState } from "react";
import { useEnvironmentSettings } from "../../hooks/useSettings";
import { useProjects, useServerConfigs } from "../../state/entities";
import { serverEnvironment } from "../../state/server";
import { useAtomCommand } from "../../state/use-atom-command";
import { ClickUpKnownRepositories } from "./ClickUpKnownRepositories";
import { ClickUpLocalRepositoryPicker } from "./ClickUpLocalRepositoryPicker";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogPopup,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogPanel,
  DialogFooter,
} from "../ui/dialog";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import {
  clickUpSourceKey,
  resolveClickUpMapping,
  repositoryKey,
  suggestClickUpRepository,
  savedGithubRepositoryUrl,
} from "./projectMappings";

export function ClickUpRepositoryMappings({
  task,
  environmentId,
}: {
  task: ClickUpTask;
  environmentId: EnvironmentId;
}) {
  const mappings = useEnvironmentSettings(
    environmentId,
    (settings) => settings.clickUpProjectMappings,
  );
  const repositories = useEnvironmentSettings(
    environmentId,
    (settings) => settings.clickUpRepositoryMappings,
  );
  const supportsSetup =
    useServerConfigs().get(environmentId)?.environment.capabilities.clickUpRepositorySetup === true;
  const projects = useProjects().filter((project) => project.environmentId === environmentId);
  const sourceOrder = ["project", "list", "folder", "space"];
  const sources = [...(task.sources ?? [])].sort(
    (left, right) => sourceOrder.indexOf(left.kind) - sourceOrder.indexOf(right.kind),
  );
  const [open, setOpen] = useState(false);
  const [sourceKey, setSourceKey] = useState("");
  const [selected, setSelected] = useState<ReadonlyArray<ProjectId>>([]);
  const [remotes, setRemotes] = useState<ReadonlyArray<ClickUpRepositoryLink>>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const update = useAtomCommand(serverEnvironment.updateSettings, { reportFailure: false });
  const items = sources.map((source) => ({
    value: clickUpSourceKey(task.workspaceId, source),
    label: `${source.kind === "project" ? "Project field" : source.kind[0]!.toUpperCase() + source.kind.slice(1)} · ${source.name}`,
  }));
  function choose(key: string) {
    setSourceKey(key);
    setSelected(mappings[key] ?? []);
    setRemotes(repositories[key] ?? []);
    setError(null);
  }
  async function save(remove = false) {
    setBusy(true);
    setError(null);
    try {
      const result = await update({
        environmentId,
        input: {
          patch: {
            clickUpProjectMappings: { [sourceKey]: remove ? null : selected },
            ...(supportsSetup
              ? {
                  clickUpRepositoryMappings: {
                    [sourceKey]: remove
                      ? null
                      : [
                          ...new Map(
                            [
                              ...remotes,
                              ...projects.flatMap((project) => {
                                if (!selected.includes(project.id) || !project.repositoryIdentity)
                                  return [];
                                const remoteUrl = savedGithubRepositoryUrl(
                                  project.repositoryIdentity.locator.remoteUrl,
                                );
                                return remoteUrl ? [{ remoteUrl, projectId: project.id }] : [];
                              }),
                            ].map((link) => [repositoryKey(link.remoteUrl), link]),
                          ).values(),
                        ],
                  },
                }
              : {}),
          },
        },
      });
      if (result._tag === "Success") setOpen(false);
      else setError("Could not save repository links. Try again.");
    } finally {
      setBusy(false);
    }
  }
  const source = sources.find((item) => clickUpSourceKey(task.workspaceId, item) === sourceKey);
  const suggestion =
    mappings[sourceKey] === undefined && repositories[sourceKey] === undefined
      ? suggestClickUpRepository(source, projects)
      : null;
  const scopeDescription =
    source?.kind === "project"
      ? "Tasks with this Project field value, even across different Lists."
      : source?.kind === "list"
        ? "Only tasks in this List."
        : source?.kind === "folder"
          ? "Tasks in every List in this Folder."
          : "Tasks throughout this Space, across its Folders and Lists.";
  return (
    <>
      <Button
        size="sm"
        variant="outline"
        disabled={!sources.length}
        onClick={() => {
          const mapped = resolveClickUpMapping(task, mappings, repositories)?.sources[0];
          choose(mapped ? clickUpSourceKey(task.workspaceId, mapped) : items[0]!.value);
          setOpen(true);
        }}
      >
        Link repositories
      </Button>
      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (!busy) setOpen(value);
        }}
      >
        <DialogPopup className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Linked repositories</DialogTitle>
            <DialogDescription>
              Choose local repositories for tasks matching this field value or location. A
              repository can have several links.
            </DialogDescription>
          </DialogHeader>
          <DialogPanel>
            <Select
              value={sourceKey}
              items={items}
              onValueChange={(value) => {
                if (value) choose(value);
              }}
              disabled={busy}
            >
              <SelectTrigger aria-label="ClickUp mapping scope">
                <SelectValue />
              </SelectTrigger>
              <SelectPopup>
                {items.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectPopup>
            </Select>
            <div className="space-y-1 text-xs text-muted-foreground">
              <p>{scopeDescription}</p>
              <p>More specific links take priority: Project field, List, Folder, then Space.</p>
              <p>Removing this mapping restores the broader match.</p>
            </div>
            {suggestion && !selected.includes(suggestion.id) && (
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => setSelected((current) => [...current, suggestion.id])}
              >
                Use matching repository: {suggestion.title}
              </Button>
            )}
            <div className="space-y-2">
              <ClickUpLocalRepositoryPicker
                key={sourceKey}
                projects={projects}
                selected={selected}
                disabled={busy}
                onSelectionChange={(projectId, checked) => {
                  if (!checked)
                    setRemotes((current) => current.filter((link) => link.projectId !== projectId));
                  setSelected((current) =>
                    checked ? [...current, projectId] : current.filter((id) => id !== projectId),
                  );
                }}
              />
              {selected.some((id) => !projects.some((project) => project.id === id)) && (
                <p className="text-xs text-muted-foreground">
                  This mapping also contains repositories no longer available in this environment.
                  Remove the mapping to clear them.
                </p>
              )}
            </div>
            {supportsSetup ? (
              <ClickUpKnownRepositories
                key={sourceKey}
                value={remotes}
                onChange={setRemotes}
                disabled={busy}
                onRemove={(link) => {
                  if (link.projectId)
                    setSelected((current) => current.filter((id) => id !== link.projectId));
                }}
              />
            ) : (
              <p className="text-xs text-muted-foreground">
                Update this environment to save GitHub repositories for download.
              </p>
            )}
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
          </DialogPanel>
          <DialogFooter>
            {(mappings[sourceKey] || repositories[sourceKey]) && (
              <Button variant="ghost" disabled={busy} onClick={() => void save(true)}>
                Remove mapping
              </Button>
            )}
            <Button variant="outline" disabled={busy} onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={busy || (!selected.length && !remotes.length)}
              onClick={() => void save()}
            >
              {busy ? "Saving…" : "Save links"}
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>
    </>
  );
}
