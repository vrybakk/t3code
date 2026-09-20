import type { EnvironmentProject } from "@t3tools/client-runtime/state/shell";
import type { WorkTrackingProject } from "@t3tools/contracts";
import { useState } from "react";

import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Switch } from "../ui/switch";

export function WorkProjects({
  projects,
  environmentProjects,
  pending,
  onSave,
  onSelect,
  selectedId,
}: {
  readonly projects: ReadonlyArray<WorkTrackingProject>;
  readonly environmentProjects: ReadonlyArray<EnvironmentProject>;
  readonly pending: boolean;
  readonly onSave: (input: {
    id?: WorkTrackingProject["id"];
    name: string;
    t3ProjectIds: ReadonlyArray<string>;
    trackingEnabled: boolean;
  }) => Promise<void>;
  readonly onSelect: (id: WorkTrackingProject["id"] | null) => void;
  readonly selectedId: WorkTrackingProject["id"] | null;
}) {
  const selected = projects.find((project) => project.id === selectedId) ?? null;
  const [name, setName] = useState(selected?.name ?? "");
  const [bound, setBound] = useState<ReadonlySet<string>>(
    () => new Set(selected?.t3ProjectIds ?? []),
  );
  const [trackingEnabled, setTrackingEnabled] = useState(selected?.trackingEnabled ?? true);
  const [error, setError] = useState("");
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return setError("Tracking project name is required.");
    if (bound.size === 0) return setError("Bind at least one T3 project workspace.");
    setError("");
    await onSave({
      ...(selected ? { id: selected.id } : {}),
      name: name.trim(),
      t3ProjectIds: [...bound],
      trackingEnabled,
    });
  };
  const toggle = (projectId: string, checked: boolean) =>
    setBound((current) => {
      const next = new Set(current);
      if (checked) next.add(projectId);
      else next.delete(projectId);
      return next;
    });
  return (
    <section className="rounded-lg border p-5" aria-labelledby="work-projects-heading">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 id="work-projects-heading" className="font-medium">
            Tracking projects
          </h2>
          <p className="text-sm text-muted-foreground">
            A tracking project can bind multiple T3 workspaces.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => onSelect(null)}>
          New project
        </Button>
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-2">
          {projects.length === 0 ? (
            <p className="text-sm text-muted-foreground">No tracking projects yet.</p>
          ) : (
            projects.map((project) => (
              <button
                key={project.id}
                className="flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm hover:bg-muted"
                onClick={() => onSelect(project.id)}
              >
                <span>{project.name}</span>
                <span className="text-muted-foreground">
                  {project.trackingEnabled ? "Enabled" : "Paused"}
                </span>
              </button>
            ))
          )}
        </div>
        <form className="space-y-3 rounded-md bg-muted/30 p-3" onSubmit={submit}>
          <label className="grid gap-1.5">
            <Label htmlFor="work-project-name">Tracking project name</Label>
            <Input
              id="work-project-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <fieldset className="grid gap-2">
            <legend className="text-sm font-medium">Bound T3 projects</legend>
            {environmentProjects.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No projects are available on this environment.
              </p>
            ) : (
              environmentProjects.map((project) => (
                <label key={project.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={bound.has(project.id)}
                    onChange={(event) => toggle(project.id, event.target.checked)}
                  />
                  {project.title}
                </label>
              ))
            )}
          </fieldset>
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="work-project-enabled">Enable this tracking project</Label>
            <Switch
              id="work-project-enabled"
              checked={trackingEnabled}
              onCheckedChange={setTrackingEnabled}
              disabled={pending}
            />
          </div>
          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : selected ? "Save project" : "Create project"}
          </Button>
        </form>
      </div>
    </section>
  );
}
