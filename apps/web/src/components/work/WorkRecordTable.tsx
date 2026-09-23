import { useAtomValue } from "@effect/atom-react";
import type { EnvironmentId, WorkOverviewInput, WorkTrackingProject } from "@t3tools/contracts";
import { formatTokens } from "@t3tools/shared/usageFormat";
import * as Option from "effect/Option";
import { AsyncResult } from "effect/unstable/reactivity";
import { useState } from "react";
import { serverEnvironment } from "../../state/server";
import { WorkPagination, WORK_PAGE_SIZE } from "./WorkPagination";
import { formatWorkDuration } from "./workMonthlySeries";
import { workRecordPresentation } from "./workOverviewPresentation";

export function WorkRecordTable({
  environmentId,
  window,
  projects,
  timeZone,
}: {
  readonly environmentId: EnvironmentId;
  readonly window: WorkOverviewInput;
  readonly projects: ReadonlyArray<WorkTrackingProject>;
  readonly timeZone: string;
}) {
  const [page, setPage] = useState(0);
  const result = useAtomValue(
    serverEnvironment.workOverview({
      environmentId,
      input: {
        ...window,
        includeRecords: true,
        includeAdjustments: false,
        recordLimit: WORK_PAGE_SIZE,
        recordOffset: page * WORK_PAGE_SIZE,
      },
    }),
  );
  const overview = Option.getOrNull(AsyncResult.value(result));
  if (overview?.recordPage) {
    const lastPage = Math.max(0, Math.ceil(overview.totals.records / WORK_PAGE_SIZE) - 1);
    if (page > lastPage) setPage(lastPage);
  }
  const formatter = new Intl.DateTimeFormat(undefined, {
    timeZone,
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const records = overview?.records.slice(0, WORK_PAGE_SIZE) ?? [];
  return (
    <div aria-busy={result.waiting}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-140 table-fixed text-sm">
          <caption className="sr-only">
            Current work records, newest first. Corrections replace previous values.
          </caption>
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th scope="col" className="w-1/5 py-2 pr-3 font-normal">
                When
              </th>
              <th scope="col" className="w-2/5 py-2 pr-3 font-normal">
                Activity
              </th>
              <th scope="col" className="w-1/5 py-2 pr-3 font-normal">
                Project
              </th>
              <th scope="col" className="py-2 pr-3 text-right font-normal">
                Time
              </th>
              <th scope="col" className="py-2 text-right font-normal">
                Tokens
              </th>
            </tr>
          </thead>
          <tbody>
            {overview === null ? (
              <tr>
                <td colSpan={5} className="h-48 text-center text-muted-foreground">
                  {result.waiting
                    ? "Loading activity…"
                    : "Activity is unavailable. Check the environment connection."}
                </td>
              </tr>
            ) : records.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-8 text-center text-muted-foreground">
                  No records on this page.
                </td>
              </tr>
            ) : (
              records.map((record) => {
                const item = workRecordPresentation(record);
                return (
                  <tr key={record.id} className="border-b border-border/50 hover:bg-muted/50">
                    <td className="py-3 pr-3 text-xs text-muted-foreground tabular-nums">
                      {formatter.format(new Date(record.occurredAt))}
                    </td>
                    <th scope="row" className="py-3 pr-3 text-left font-normal">
                      <span className="block truncate">{item.title}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {item.detail}
                      </span>
                    </th>
                    <td className="py-3 pr-3">
                      <span className="block truncate text-muted-foreground">
                        {projects.find((project) => project.id === record.trackingProjectId)
                          ?.name ?? "Archived project"}
                      </span>
                    </td>
                    <td className="py-3 pr-3 text-right tabular-nums">
                      {item.duration === null ? "—" : formatWorkDuration(item.duration)}
                    </td>
                    <td className="py-3 text-right text-muted-foreground tabular-nums">
                      {record.kind === "manual"
                        ? "—"
                        : formatTokens(
                            (record.tokens.inputTokens ?? 0) + (record.tokens.outputTokens ?? 0),
                          )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      {overview?.recordPage ? (
        <WorkPagination
          page={page}
          total={overview.totals.records}
          pending={result.waiting}
          onPageChange={setPage}
        />
      ) : overview ? (
        <p className="pt-3 text-xs text-muted-foreground">
          Showing {records.length} recent entries. Update this environment for paginated history.
        </p>
      ) : null}
    </div>
  );
}
