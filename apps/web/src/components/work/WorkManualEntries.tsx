import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/shell";
import type { WorkManualEntryInput, WorkRecord, WorkTrackingProject } from "@t3tools/contracts";
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
import { WorkSelect } from "./WorkSelect";

export function WorkManualEntries({
  projects,
  threads,
  record,
  pending,
  onSave,
  onCancel,
}: {
  readonly projects: ReadonlyArray<WorkTrackingProject>;
  readonly threads: ReadonlyArray<EnvironmentThreadShell>;
  readonly record?: WorkRecord | null;
  readonly pending: boolean;
  readonly onSave: (input: WorkManualEntryInput) => Promise<boolean>;
  readonly onCancel: () => void;
}) {
  const [projectId, setProjectId] = useState(record?.trackingProjectId ?? projects[0]?.id);
  const [occurredAt, setOccurredAt] = useState(() =>
    formatLocalDateTime(record?.occurredAt ?? new Date()),
  );
  const [duration, setDuration] = useState(
    record?.durationMs == null ? "" : String(record.durationMs / 60_000),
  );
  const [threadId, setThreadId] = useState<WorkManualEntryInput["threadId"]>(
    record?.threadId ?? undefined,
  );
  const [repositoryId, setRepositoryId] = useState<WorkManualEntryInput["repositoryId"]>(
    record?.repositoryId ?? undefined,
  );
  const [category, setCategory] = useState(record?.category ?? "");
  const [note, setNote] = useState(record?.note ?? "");
  const [crossRepository, setCrossRepository] = useState(record?.crossRepository ?? false);
  const [error, setError] = useState("");
  const selectedProject = projects.find((project) => project.id === projectId) ?? null;
  const visibleThreads = threads.filter((thread) =>
    selectedProject?.t3ProjectIds.includes(thread.projectId),
  );
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (pending) return;
    const durationMs = parseDurationMinutes(duration);
    const occurredAtIso = localDateTimeToIso(occurredAt);
    if (!projectId || !occurredAtIso || durationMs === null)
      return setError("Project, date/time, and a non-negative duration are required.");
    setError("");
    try {
      const saved = await onSave({
        ...(record ? { id: record.id } : {}),
        trackingProjectId: projectId,
        occurredAt: occurredAtIso,
        durationMs,
        ...(threadId ? { threadId } : {}),
        ...(repositoryId && !crossRepository ? { repositoryId } : {}),
        crossRepository,
        ...(category.trim() ? { category: category.trim() } : {}),
        ...(note.trim() ? { note: note.trim() } : {}),
      });
      if (!saved)
        setError("Could not save this entry. Your changes are still here; please try again.");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not save this entry. Please try again.",
      );
    }
  };
  return (
    <form onSubmit={submit}>
      {projects.length === 0 ? (
        <p className="mb-4 text-sm text-muted-foreground">
          Tracking projects appear automatically when local T3 projects are available.
        </p>
      ) : null}
      <fieldset disabled={pending} className="grid min-w-0 gap-3 sm:grid-cols-2">
        <div className="grid min-w-0 gap-1.5">
          <Label htmlFor="work-manual-project">Tracking project</Label>
          <WorkSelect
            id="work-manual-project"
            value={projectId ?? ""}
            disabled={pending}
            onValueChange={(value) => {
              setProjectId(projects.find((project) => project.id === value)?.id);
              setRepositoryId(undefined);
              setThreadId(undefined);
            }}
            options={projects.map((project) => ({ value: project.id, label: project.name }))}
          />
        </div>
        <div className="grid min-w-0 gap-1.5">
          <Label htmlFor="work-manual-occurred-at">Date and time</Label>
          <Input
            id="work-manual-occurred-at"
            type="datetime-local"
            value={occurredAt}
            onChange={(event) => setOccurredAt(event.target.value)}
          />
        </div>
        <div className="grid min-w-0 gap-1.5">
          <Label htmlFor="work-manual-duration">Duration (minutes)</Label>
          <Input
            id="work-manual-duration"
            inputMode="decimal"
            value={duration}
            onChange={(event) => setDuration(event.target.value)}
            placeholder="60"
          />
        </div>
        <div className="grid min-w-0 gap-1.5">
          <Label htmlFor="work-manual-thread">Thread (optional)</Label>
          <WorkSelect
            id="work-manual-thread"
            value={threadId ?? ""}
            disabled={pending}
            onValueChange={(value) =>
              setThreadId(visibleThreads.find((thread) => thread.id === value)?.id)
            }
            options={[
              { value: "", label: "No thread" },
              ...visibleThreads.map((thread) => ({ value: thread.id, label: thread.title })),
              ...(threadId && !visibleThreads.some((thread) => thread.id === threadId)
                ? [{ value: threadId, label: "Original thread" }]
                : []),
            ]}
          />
        </div>
        <div className="grid min-w-0 gap-1.5">
          <Label htmlFor="work-manual-repository-select">Repository (optional)</Label>
          <WorkSelect
            id="work-manual-repository-select"
            value={repositoryId ?? ""}
            onValueChange={(value) =>
              setRepositoryId(
                selectedProject?.repositories.find((repository) => repository.id === value)?.id,
              )
            }
            disabled={pending || crossRepository}
            options={[
              { value: "", label: "No repository" },
              ...(selectedProject?.repositories ?? [])
                .filter(
                  (repository) =>
                    repository.inclusion === "included" || repository.id === repositoryId,
                )
                .map((repository) => ({
                  value: repository.id,
                  label:
                    repository.localRoot.split(/[\\/]/u).findLast(Boolean) ?? repository.localRoot,
                  title: repository.localRoot,
                })),
            ]}
          />
        </div>
        <div className="grid min-w-0 gap-1.5">
          <Label htmlFor="work-manual-category">Category (optional)</Label>
          <Input
            id="work-manual-category"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
          />
        </div>
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input
            type="checkbox"
            checked={crossRepository}
            onChange={(event) => {
              setCrossRepository(event.target.checked);
              if (event.target.checked) setRepositoryId(undefined);
            }}
          />
          Cross-repository work
        </label>
        <div className="grid min-w-0 gap-1.5 sm:col-span-2">
          <Label htmlFor="work-manual-note">Note (optional)</Label>
          <Textarea
            id="work-manual-note"
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </div>
        {error ? (
          <p role="alert" className="text-sm text-destructive sm:col-span-2">
            {error}
          </p>
        ) : null}
        <div className="mt-2 flex justify-end gap-2 sm:col-span-2">
          <Button type="button" variant="outline" disabled={pending} onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending || !projectId}>
            {pending ? "Saving…" : record ? "Save changes" : "Add entry"}
          </Button>
        </div>
      </fieldset>
    </form>
  );
}
