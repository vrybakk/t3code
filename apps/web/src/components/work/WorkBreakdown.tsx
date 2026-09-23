import type { EnvironmentId, WorkOverview, WorkOverviewInput } from "@t3tools/contracts";
import { formatTokens } from "@t3tools/shared/usageFormat";
import { useState } from "react";
import { Toggle, ToggleGroup } from "../ui/toggle-group";
import { WorkPagination, WORK_PAGE_SIZE } from "./WorkPagination";
import { WorkRecordTable } from "./WorkRecordTable";
import { formatWorkDuration } from "./workMonthlySeries";

export function WorkBreakdown({
  overview,
  environmentId,
  window,
  timeZone,
}: {
  readonly overview: WorkOverview;
  readonly environmentId: EnvironmentId;
  readonly window: WorkOverviewInput;
  readonly timeZone: string;
}) {
  const [mode, setMode] = useState<"projects" | "records">("projects");
  const [page, setPage] = useState(0);
  const projects = [...overview.projectTotals].sort(
    (a, b) =>
      b.totals.manualMs - a.totals.manualMs ||
      b.totals.agentElapsedMs - a.totals.agentElapsedMs ||
      a.trackingProjectId.localeCompare(b.trackingProjectId),
  );
  const currentPage = Math.min(page, Math.max(0, Math.ceil(projects.length / WORK_PAGE_SIZE) - 1));
  return (
    <section className="space-y-3" aria-labelledby="work-breakdown-heading">
      <div className="flex items-center justify-between gap-3">
        <h2 id="work-breakdown-heading" className="text-sm font-medium">
          Breakdown
        </h2>
        <ToggleGroup
          aria-label="Work breakdown"
          variant="segmented"
          value={[mode]}
          onValueChange={(values) => {
            if (values[0] === "projects" || values[0] === "records") setMode(values[0]);
          }}
        >
          <Toggle value="projects">Projects</Toggle>
          <Toggle value="records">Activity</Toggle>
        </ToggleGroup>
      </div>
      {mode === "records" ? (
        <WorkRecordTable
          environmentId={environmentId}
          window={window}
          projects={overview.projects}
          timeZone={timeZone}
        />
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-160 table-fixed text-sm">
              <caption className="sr-only">Project totals for the selected period</caption>
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="w-2/5 px-3 py-2 font-normal" scope="col">
                    Project
                  </th>
                  {["Manual", "Agent", "Tasks", "Tokens"].map((label) => (
                    <th key={label} className="px-3 py-2 text-right font-normal" scope="col">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {projects.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-muted-foreground">
                      No work recorded in this period.
                    </td>
                  </tr>
                ) : (
                  projects
                    .slice(currentPage * WORK_PAGE_SIZE, (currentPage + 1) * WORK_PAGE_SIZE)
                    .map((summary) => (
                      <tr
                        key={summary.trackingProjectId}
                        className="border-b border-border/50 hover:bg-muted/50"
                      >
                        <th scope="row" className="px-3 py-3 text-left font-normal">
                          <span className="block truncate">
                            {overview.projects.find(
                              (project) => project.id === summary.trackingProjectId,
                            )?.name ?? "Archived project"}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {summary.totals.records.toLocaleString()}{" "}
                            {summary.totals.records === 1 ? "record" : "records"}
                          </span>
                        </th>
                        <td className="px-3 py-3 text-right tabular-nums">
                          {formatWorkDuration(summary.totals.manualMs)}
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums">
                          {formatWorkDuration(summary.totals.agentElapsedMs)}
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums">
                          {formatWorkDuration(summary.totals.agentTaskMs)}
                        </td>
                        <td className="px-3 py-3 text-right text-muted-foreground tabular-nums">
                          {formatTokens(summary.totals.inputTokens + summary.totals.outputTokens)}
                        </td>
                      </tr>
                    ))
                )}
              </tbody>
            </table>
          </div>
          <WorkPagination page={currentPage} total={projects.length} onPageChange={setPage} />
        </>
      )}
    </section>
  );
}
