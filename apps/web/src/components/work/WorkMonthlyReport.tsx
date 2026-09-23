import { useAtomValue } from "@effect/atom-react";
import type { EnvironmentId, WorkTrackingProject, WorkTrackingProjectId } from "@t3tools/contracts";
import * as Option from "effect/Option";
import { AsyncResult } from "effect/unstable/reactivity";
import { ChevronLeftIcon, ChevronRightIcon, DownloadIcon } from "lucide-react";
import { useMemo, useState } from "react";

import { serverEnvironment } from "../../state/server";
import { workWindow } from "../../state/workTracking";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Toggle, ToggleGroup } from "../ui/toggle-group";
import { WorkMonthlyChart } from "./WorkMonthlyChart";
import { WorkSelect } from "./WorkSelect";
import {
  buildWorkMonthlySeries,
  formatWorkDuration,
  shiftWorkMonth,
  workProjectColor,
  type WorkMonthlyMetric,
} from "./workMonthlySeries";

const METRICS = [
  { value: "developerMs", label: "Developer" },
  { value: "agentElapsedMs", label: "Agent elapsed" },
  { value: "taskMs", label: "Task time" },
] as const;

export function WorkMonthlyReport({
  environmentId,
  projects,
  timeZone,
  defaultMonth,
  onCsv,
}: {
  readonly environmentId: EnvironmentId;
  readonly projects: ReadonlyArray<WorkTrackingProject>;
  readonly timeZone: string;
  readonly defaultMonth: string;
  readonly onCsv: (
    trackingProjectId: WorkTrackingProjectId | undefined,
    month: string,
  ) => Promise<void>;
}) {
  const [month, setMonth] = useState(defaultMonth);
  const [projectId, setProjectId] = useState("");
  const [metric, setMetric] = useState<WorkMonthlyMetric>("developerMs");
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState(false);
  const selectedProject = projects.find((project) => project.id === projectId);
  const window = useMemo(
    () => workWindow("month", timeZone, new Date(`${month}-15T12:00:00Z`)),
    [month, timeZone],
  );
  const result = useAtomValue(
    serverEnvironment.workOverview({
      environmentId,
      input: {
        ...window,
        includeRecords: false,
        ...(selectedProject ? { trackingProjectId: selectedProject.id } : {}),
      },
    }),
  );
  const overview = Option.getOrNull(AsyncResult.value(result));
  const chartProjects = selectedProject ? [selectedProject] : projects;
  const days = useMemo(
    () =>
      buildWorkMonthlySeries(
        month,
        overview?.dailyTotals ?? [],
        metric,
        chartProjects.map((project) => project.id),
      ),
    [month, overview?.dailyTotals, metric, chartProjects],
  );
  const activeMetric = METRICS.find((item) => item.value === metric)!;
  const rows = (overview?.projectTotals ?? []).map((entry) => ({
    ...entry,
    project: projects.find((project) => project.id === entry.trackingProjectId),
  }));
  const download = async () => {
    setExporting(true);
    setExportError(false);
    try {
      await onCsv(selectedProject?.id, month);
    } catch {
      setExportError(true);
    } finally {
      setExporting(false);
    }
  };
  return (
    <section className="min-w-0 rounded-lg border p-5" aria-labelledby="work-monthly-heading">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="work-monthly-heading" className="font-medium">
            Monthly report
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            All projects in one report. Developer and agent time stay separate.
          </p>
        </div>
        <Button
          variant="outline"
          disabled={
            exporting ||
            overview === null ||
            (!selectedProject && overview.dailyTotals === undefined)
          }
          onClick={() => void download()}
        >
          <DownloadIcon />
          {exporting ? "Exporting…" : "Download CSV"}
        </Button>
      </div>
      <div className="mt-5 grid min-w-0 gap-3 sm:grid-cols-2">
        <div className="grid min-w-0 gap-1.5">
          <Label htmlFor="work-monthly-month">Month</Label>
          <div className="flex min-w-0 gap-1.5">
            <Button
              variant="outline"
              size="icon"
              aria-label="Previous month"
              onClick={() => setMonth(shiftWorkMonth(month, -1))}
            >
              <ChevronLeftIcon />
            </Button>
            <Input
              id="work-monthly-month"
              type="month"
              value={month}
              onChange={(event) => {
                if (/^\d{4}-(?:0[1-9]|1[0-2])$/u.test(event.target.value))
                  setMonth(event.target.value);
              }}
            />
            <Button
              variant="outline"
              size="icon"
              aria-label="Next month"
              onClick={() => setMonth(shiftWorkMonth(month, 1))}
            >
              <ChevronRightIcon />
            </Button>
          </div>
        </div>
        <div className="grid min-w-0 gap-1.5">
          <Label htmlFor="work-monthly-project">Projects</Label>
          <WorkSelect
            id="work-monthly-project"
            value={selectedProject?.id ?? ""}
            onValueChange={setProjectId}
            options={[
              { value: "", label: "All projects" },
              ...projects.map((project) => ({ value: project.id, label: project.name })),
            ]}
          />
        </div>
      </div>
      {exportError ? (
        <p role="alert" className="mt-3 text-sm text-destructive">
          Could not download the report. Try again.
        </p>
      ) : null}
      {result.waiting && overview === null ? (
        <p role="status" className="mt-4 text-sm text-muted-foreground">
          Loading monthly report…
        </p>
      ) : null}
      {overview ? (
        <>
          <div className="mt-6 grid grid-cols-2 gap-4 border-y py-4 text-sm sm:grid-cols-3">
            {[
              { label: "Developer time", value: overview.totals.manualMs },
              { label: "Agent elapsed", value: overview.totals.agentElapsedMs },
              { label: "Task time", value: overview.totals.agentTaskMs },
            ].map((item) => (
              <div key={item.label}>
                <p className="text-muted-foreground">{item.label}</p>
                <p className="mt-1 text-lg font-medium tabular-nums">
                  {formatWorkDuration(item.value)}
                </p>
              </div>
            ))}
          </div>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-sm font-medium">Daily activity</h3>
            <ToggleGroup
              aria-label="Chart time metric"
              value={[metric]}
              onValueChange={(values) => {
                const selected = METRICS.find((item) => item.value === values[0]);
                if (selected) setMetric(selected.value);
              }}
            >
              {METRICS.map((item) => (
                <Toggle key={item.value} value={item.value}>
                  {item.label}
                </Toggle>
              ))}
            </ToggleGroup>
          </div>
          {overview.dailyTotals === undefined ? (
            <p className="mt-4 text-sm text-muted-foreground">
              Update this environment for daily charts and combined CSV. Monthly totals are
              available; select one project to download its CSV.
            </p>
          ) : (
            <WorkMonthlyChart
              days={days}
              projects={chartProjects}
              metricLabel={activeMetric.label}
            />
          )}
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-120 table-fixed text-sm">
              <caption className="sr-only">
                Project breakdown for {month} in {timeZone}
              </caption>
              <thead>
                <tr className="border-b text-xs text-muted-foreground">
                  <th scope="col" className="w-2/5 py-2 pr-3 text-left font-medium">
                    Project
                  </th>
                  <th scope="col" className="px-2 py-2 text-right font-medium">
                    Developer
                  </th>
                  <th scope="col" className="px-2 py-2 text-right font-medium">
                    Agent
                  </th>
                  <th scope="col" className="px-2 py-2 text-right font-medium">
                    Tasks
                  </th>
                  <th scope="col" className="py-2 pl-2 text-right font-medium">
                    Tokens
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-5 text-muted-foreground">
                      No work recorded in this month.
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => (
                    <tr key={row.trackingProjectId} className="border-b last:border-0">
                      <th scope="row" className="py-3 pr-3 text-left font-medium">
                        <span className="flex min-w-0 items-center gap-2">
                          <span
                            className="size-2 shrink-0 rounded-full"
                            style={{
                              backgroundColor: workProjectColor(
                                chartProjects.findIndex(
                                  (project) => project.id === row.trackingProjectId,
                                ),
                              ),
                            }}
                          />
                          <span className="break-words">
                            {row.project?.name ?? "Archived project"}
                          </span>
                        </span>
                      </th>
                      <td className="px-2 py-3 text-right tabular-nums">
                        {formatWorkDuration(row.totals.manualMs)}
                      </td>
                      <td className="px-2 py-3 text-right tabular-nums">
                        {formatWorkDuration(row.totals.agentElapsedMs)}
                      </td>
                      <td className="px-2 py-3 text-right tabular-nums">
                        {formatWorkDuration(row.totals.agentTaskMs)}
                      </td>
                      <td className="py-3 pl-2 text-right tabular-nums">
                        {(row.totals.inputTokens + row.totals.outputTokens).toLocaleString()}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Reporting timezone: {timeZone}. Tokens include input and output.
          </p>
        </>
      ) : !result.waiting ? (
        <p role="alert" className="mt-4 text-sm text-muted-foreground">
          Monthly report is unavailable. Check the environment connection.
        </p>
      ) : null}
    </section>
  );
}
