import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/shell";
import type { WorkRecord, WorkTrackingProject } from "@t3tools/contracts";
import { useState } from "react";

import {
  formatLocalDateTime,
  localDateTimeToIso,
  parseDurationMinutes,
} from "../../state/workTracking";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";

export function isValidWorkMonth(value: string): boolean {
  return /^\d{4}-(?:0[1-9]|1[0-2])$/u.test(value);
}

export function WorkManualEntries({
  projects,
  threads,
  records,
  month,
  monthLoading,
  pending,
  onMonthChange,
  onSave,
}: {
  readonly projects: ReadonlyArray<WorkTrackingProject>;
  readonly threads: ReadonlyArray<EnvironmentThreadShell>;
  readonly records: ReadonlyArray<WorkRecord>;
  readonly month: string;
  readonly monthLoading: boolean;
  readonly pending: boolean;
  readonly onMonthChange: (month: string) => void;
  readonly onSave: (input: {
    id?: WorkRecord["id"];
    trackingProjectId: WorkTrackingProject["id"];
    occurredAt: string;
    durationMs: number;
    threadId?: string;
    repositoryId?: string;
    crossRepository?: boolean;
    category?: string;
    note?: string;
  }) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState<WorkRecord | null>(null);
  const [projectId, setProjectId] = useState(() => projects[0]?.id ?? "");
  const [occurredAt, setOccurredAt] = useState(() => formatLocalDateTime(new Date()));
  const [duration, setDuration] = useState("");
  const [threadId, setThreadId] = useState("");
  const [repositoryId, setRepositoryId] = useState("");
  const [category, setCategory] = useState("");
  const [note, setNote] = useState("");
  const [crossRepository, setCrossRepository] = useState(false);
  const [error, setError] = useState("");
  const selectedProject = projects.find((project) => project.id === projectId) ?? null;
  const visibleThreads = threads.filter((thread) =>
    selectedProject?.t3ProjectIds.includes(thread.projectId),
  );
  const reset = (record: WorkRecord | null) => {
    setEditing(record);
    setProjectId(record?.trackingProjectId ?? projects[0]?.id ?? "");
    setOccurredAt(
      record ? formatLocalDateTime(record.occurredAt) : formatLocalDateTime(new Date()),
    );
    setDuration(
      record?.durationMs === null || record === null ? "" : String(record.durationMs / 60_000),
    );
    setThreadId(record?.threadId ?? "");
    setRepositoryId(record?.repositoryId ?? "");
    setCategory(record?.category ?? "");
    setNote(record?.note ?? "");
    setCrossRepository(record?.crossRepository ?? false);
    setError("");
  };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const durationMs = parseDurationMinutes(duration);
    const occurredAtIso = localDateTimeToIso(occurredAt);
    if (!projectId || !occurredAtIso || durationMs === null)
      return setError("Project, date/time, and a non-negative duration are required.");
    setError("");
    const saved = await onSave({
      ...(editing ? { id: editing.id } : {}),
      trackingProjectId: projectId as never,
      occurredAt: occurredAtIso,
      durationMs,
      ...(threadId ? { threadId } : {}),
      ...(repositoryId ? { repositoryId } : {}),
      crossRepository,
      ...(category.trim() ? { category: category.trim() } : {}),
      ...(note.trim() ? { note: note.trim() } : {}),
    });
    if (saved) reset(null);
  };
  const manual = records.filter((record) => record.kind === "manual");
  return (
    <section className="rounded-lg border p-5" aria-labelledby="work-manual-heading">
      <h2 id="work-manual-heading" className="font-medium">
        Developer time
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Manual developer entries are editable. Agent metrics are captured automatically and stay
        immutable.
      </p>
      {projects.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          Create a tracking project before adding developer time.
        </p>
      ) : (
        <form className="mt-4 grid gap-3 md:grid-cols-2" onSubmit={submit}>
          <label className="grid gap-1.5">
            <Label htmlFor="work-manual-project">Tracking project</Label>
            <select
              id="work-manual-project"
              className="h-9 rounded-lg border bg-background px-3 text-sm"
              value={projectId}
              onChange={(event) => {
                setProjectId(event.target.value);
                setRepositoryId("");
                setThreadId("");
              }}
            >
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1.5">
            <Label htmlFor="work-manual-occurred-at">Date and time</Label>
            <Input
              id="work-manual-occurred-at"
              type="datetime-local"
              value={occurredAt}
              onChange={(event) => setOccurredAt(event.target.value)}
            />
          </label>
          <label className="grid gap-1.5">
            <Label htmlFor="work-manual-duration">Duration (minutes)</Label>
            <Input
              id="work-manual-duration"
              inputMode="decimal"
              value={duration}
              onChange={(event) => setDuration(event.target.value)}
              placeholder="60"
            />
          </label>
          <label className="grid gap-1.5">
            <Label htmlFor="work-manual-thread">Thread (optional)</Label>
            <select
              id="work-manual-thread"
              className="h-9 rounded-lg border bg-background px-3 text-sm"
              value={threadId}
              onChange={(event) => setThreadId(event.target.value)}
            >
              <option value="">No thread</option>
              {visibleThreads.map((thread) => (
                <option key={thread.id} value={thread.id}>
                  {thread.title}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1.5">
            <Label htmlFor="work-manual-repository-select">Repository (optional)</Label>
            <select
              id="work-manual-repository-select"
              className="h-9 rounded-lg border bg-background px-3 text-sm"
              value={repositoryId}
              onChange={(event) => setRepositoryId(event.target.value)}
              disabled={crossRepository}
            >
              <option value="">No repository</option>
              {selectedProject?.repositories
                .filter((repository) => repository.inclusion === "included")
                .map((repository) => (
                  <option key={repository.id} value={repository.id}>
                    {repository.localRoot}
                  </option>
                ))}
            </select>
          </label>
          <label className="grid gap-1.5">
            <Label htmlFor="work-manual-category">Category (optional)</Label>
            <Input
              id="work-manual-category"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
            />
          </label>
          <label className="flex items-center gap-2 text-sm md:col-span-2">
            <input
              type="checkbox"
              checked={crossRepository}
              onChange={(event) => {
                setCrossRepository(event.target.checked);
                if (event.target.checked) setRepositoryId("");
              }}
            />
            Cross-repository work
          </label>
          <label className="grid gap-1.5 md:col-span-2">
            <Label htmlFor="work-manual-note">Note (optional)</Label>
            <Textarea
              id="work-manual-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </label>
          {error ? (
            <p role="alert" className="text-sm text-destructive md:col-span-2">
              {error}
            </p>
          ) : null}
          <div className="flex gap-2 md:col-span-2">
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : editing ? "Save correction" : "Add developer time"}
            </Button>
            {editing ? (
              <Button type="button" variant="outline" onClick={() => reset(null)}>
                Cancel
              </Button>
            ) : null}
          </div>
        </form>
      )}
      <div className="mt-5 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-medium">Manual entries</h3>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            Month
            <Input
              aria-label="Manual entry month"
              className="h-8 w-auto"
              type="month"
              value={month}
              onChange={(event) => {
                if (isValidWorkMonth(event.target.value)) onMonthChange(event.target.value);
              }}
            />
          </label>
        </div>
        {monthLoading ? <p className="text-sm text-muted-foreground">Loading month…</p> : null}
        {manual.length === 0 ? (
          <p className="text-sm text-muted-foreground">No manual entries in this month.</p>
        ) : (
          manual.map((record) => (
            <div
              key={record.id}
              className="flex items-center justify-between gap-3 rounded-md border p-3 text-sm"
            >
              <span>
                {record.occurredAt.slice(0, 10)} ·{" "}
                {record.durationMs === null ? "Unavailable" : `${record.durationMs / 60_000}m`}
                {record.note ? ` · ${record.note}` : ""}
              </span>
              <Button size="sm" variant="outline" onClick={() => reset(record)}>
                Edit
              </Button>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
