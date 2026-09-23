import { useAtomValue } from "@effect/atom-react";
import type { EnvironmentId, WorkTrackingProject } from "@t3tools/contracts";
import * as Option from "effect/Option";
import { AsyncResult } from "effect/unstable/reactivity";
import { useMemo, useState } from "react";

import { serverEnvironment } from "../../state/server";
import { useNowMinute } from "../../hooks/useNowMinute";
import { workWindow } from "../../state/workTracking";
import { Toggle, ToggleGroup } from "../ui/toggle-group";
import { Button } from "../ui/button";
import { WorkSummary } from "./WorkSummary";
import { WorkSelect } from "./WorkSelect";
import { WorkBreakdown } from "./WorkBreakdown";
import { workOverviewDays } from "./workOverviewPresentation";

const PERIODS = [
  { value: "today", label: "Today" },
  { value: "week", label: "This week" },
  { value: "month", label: "This month" },
] as const;

export function WorkOverview({
  environmentId,
  timeZone,
  projects,
  onAddEntry,
  canAddEntry,
}: {
  readonly environmentId: EnvironmentId;
  readonly timeZone: string;
  readonly projects: ReadonlyArray<WorkTrackingProject>;
  readonly onAddEntry: () => void;
  readonly canAddEntry: boolean;
}) {
  const [period, setPeriod] = useState<"today" | "week" | "month">("month");
  const [projectId, setProjectId] = useState("");
  const selectedProject = projects.find((project) => project.id === projectId);
  const nowMinute = useNowMinute();
  const window = useMemo(
    () => workWindow(period, timeZone, new Date(`${nowMinute}:00Z`)),
    [period, timeZone, nowMinute],
  );
  const input = {
    ...window,
    ...(selectedProject ? { trackingProjectId: selectedProject.id } : {}),
    includeRecords: false,
  };
  const result = useAtomValue(serverEnvironment.workOverview({ environmentId, input }));
  const data = Option.getOrNull(AsyncResult.value(result));
  const overview = data ? { ...data, projects } : null;
  const days = useMemo(
    () => workOverviewDays(window.since, window.until, timeZone),
    [window, timeZone],
  );
  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="grid w-full gap-1.5 sm:w-64">
          <label htmlFor="work-overview-project" className="text-xs text-muted-foreground">
            Projects
          </label>
          <WorkSelect
            id="work-overview-project"
            value={selectedProject?.id ?? ""}
            onValueChange={setProjectId}
            options={[
              { value: "", label: "All projects" },
              ...projects.map((project) => ({ value: project.id, label: project.name })),
            ]}
          />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <ToggleGroup
            aria-label="Overview period"
            variant="segmented"
            className="h-9 sm:h-8"
            value={[period]}
            onValueChange={(values) => {
              const selected = PERIODS.find((item) => item.value === values[0]);
              if (selected) setPeriod(selected.value);
            }}
          >
            {PERIODS.map((item) => (
              <Toggle key={item.value} value={item.value} className="h-full">
                {item.label}
              </Toggle>
            ))}
          </ToggleGroup>
          <Button onClick={onAddEntry} disabled={!canAddEntry}>
            Add entry
          </Button>
        </div>
      </div>
      {overview ? (
        <>
          <WorkSummary overview={overview} days={days} />
          <WorkBreakdown
            key={`${environmentId}:${window.since}:${selectedProject?.id ?? "all"}`}
            overview={overview}
            environmentId={environmentId}
            window={input}
            timeZone={timeZone}
          />
          <p className="text-xs text-muted-foreground">Reporting timezone: {timeZone}.</p>
        </>
      ) : result.waiting ? (
        <div role="status" aria-label="Loading work overview" className="space-y-8">
          <div className="h-64 rounded-md bg-muted/30" />
          <div className="h-48 rounded-md bg-muted/30" />
          <span className="sr-only">Loading work overview…</span>
        </div>
      ) : (
        <p role="alert" className="text-sm text-muted-foreground">
          Work overview is unavailable. Check the environment connection.
        </p>
      )}
    </div>
  );
}
