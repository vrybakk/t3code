import type { ClickUpTask, EnvironmentId, ProjectId } from "@t3tools/contracts";
import { useState } from "react";
import { useEnvironmentSettings } from "../../hooks/useSettings";
import { useProjects } from "../../state/entities";
import { serverEnvironment } from "../../state/server";
import { useAtomCommand } from "../../state/use-atom-command";
import { Button } from "../ui/button";
import { Checkbox } from "../ui/checkbox";
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
import { clickUpSourceKey, resolveClickUpMapping } from "./projectMappings";

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
  const projects = useProjects().filter((project) => project.environmentId === environmentId);
  const sources = task.sources ?? [];
  const [open, setOpen] = useState(false);
  const [sourceKey, setSourceKey] = useState("");
  const [selected, setSelected] = useState<ReadonlyArray<ProjectId>>([]);
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
    setError(null);
  }
  async function save(remove = false) {
    setBusy(true);
    setError(null);
    try {
      const result = await update({
        environmentId,
        input: { patch: { clickUpProjectMappings: { [sourceKey]: remove ? null : selected } } },
      });
      if (result._tag === "Success") setOpen(false);
      else setError("Could not save repository links. Try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Button
        size="sm"
        variant="outline"
        disabled={!sources.length}
        onClick={() => {
          const mapped = resolveClickUpMapping(task, mappings)?.sources[0];
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
        <DialogPopup>
          <DialogHeader>
            <DialogTitle>Linked repositories</DialogTitle>
            <DialogDescription>
              Choose which local repositories belong to this ClickUp project or location. A
              repository can belong to several mappings.
            </DialogDescription>
          </DialogHeader>
          <DialogPanel className="space-y-4">
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
            <p className="text-xs text-muted-foreground">
              The first matching mapping is used: Project field, List, Folder, then Space. Removing
              a mapping restores that fallback.
            </p>
            <div className="space-y-2">
              {projects.map((project) => (
                <label
                  key={project.id}
                  className="flex items-start gap-3 rounded-md border border-border p-3"
                >
                  <Checkbox
                    aria-label={`${project.title} — ${project.workspaceRoot}`}
                    checked={selected.includes(project.id)}
                    disabled={busy}
                    onCheckedChange={(checked) =>
                      setSelected((current) =>
                        checked
                          ? [...current, project.id]
                          : current.filter((id) => id !== project.id),
                      )
                    }
                  />
                  <span className="min-w-0 text-sm">
                    <span className="block">{project.title}</span>
                    <span className="block break-all text-xs text-muted-foreground">
                      {project.workspaceRoot}
                    </span>
                  </span>
                </label>
              ))}
              {!projects.length && (
                <p className="text-sm text-muted-foreground">Add a local project to Nerd first.</p>
              )}
              {selected.some((id) => !projects.some((project) => project.id === id)) && (
                <p className="text-xs text-muted-foreground">
                  This mapping also contains repositories no longer available in this environment.
                  Remove the mapping to clear them.
                </p>
              )}
            </div>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
          </DialogPanel>
          <DialogFooter>
            {mappings[sourceKey] && (
              <Button variant="ghost" disabled={busy} onClick={() => void save(true)}>
                Remove mapping
              </Button>
            )}
            <Button variant="outline" disabled={busy} onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button disabled={busy || !selected.length} onClick={() => void save()}>
              {busy ? "Saving…" : "Save links"}
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>
    </>
  );
}
