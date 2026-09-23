import type { EnvironmentId, WorkRecord, WorkTrackingProject } from "@t3tools/contracts";
import { workDateRange } from "@t3tools/shared/workTimeWindow";
import { useMemo, useState } from "react";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { WorkRecordTable } from "./WorkRecordTable";
import { workMonthDays } from "./workMonthlySeries";

export function WorkActivity({
  environmentId,
  projects,
  timeZone,
  month,
  projectId,
  onEdit,
}: {
  environmentId: EnvironmentId;
  projects: ReadonlyArray<WorkTrackingProject>;
  timeZone: string;
  month: string;
  projectId: string;
  onEdit: (record: WorkRecord) => void;
}) {
  const [from, setFrom] = useState(`${month}-01`);
  const [through, setThrough] = useState(() => workMonthDays(month).at(-1)!);
  const window = useMemo(() => workDateRange(from, through, timeZone), [from, through, timeZone]);
  const selectedProject = projects.find((project) => project.id === projectId);
  return (
    <section className="space-y-4" aria-labelledby="work-activity-heading">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 id="work-activity-heading" className="text-sm font-medium">
            All activity
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Agent and manual records · {selectedProject?.name ?? "All projects"}. Manual entries can
            be edited.
          </p>
        </div>
        <div className="grid w-full grid-cols-2 gap-3 sm:w-auto">
          <div className="grid min-w-0 gap-1.5">
            <Label htmlFor="work-activity-from">From</Label>
            <Input
              id="work-activity-from"
              type="date"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
            />
          </div>
          <div className="grid min-w-0 gap-1.5">
            <Label htmlFor="work-activity-through">Through</Label>
            <Input
              id="work-activity-through"
              type="date"
              value={through}
              onChange={(event) => setThrough(event.target.value)}
            />
          </div>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Dates use {timeZone}. This range filters the activity list; charts and CSV use the report
        month above.
      </p>
      {window ? (
        <WorkRecordTable
          key={`${window.since}:${window.until}:${projectId}`}
          environmentId={environmentId}
          window={{
            ...window,
            ...(selectedProject ? { trackingProjectId: selectedProject.id } : {}),
          }}
          projects={projects}
          timeZone={timeZone}
          onEdit={onEdit}
        />
      ) : (
        <p role="alert" className="text-sm text-destructive">
          Choose valid dates with From on or before Through.
        </p>
      )}
    </section>
  );
}
