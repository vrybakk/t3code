import type { WorkOverview } from "@t3tools/contracts";
import { formatTokens } from "@t3tools/shared/usageFormat";
import { WorkOverviewChart } from "./WorkOverviewChart";
import { formatWorkDuration } from "./workMonthlySeries";

const METRICS = [
  {
    value: "developerMs",
    field: "manualMs",
    label: "Manual time",
    note: "Manually recorded work",
  },
  {
    value: "agentElapsedMs",
    field: "agentElapsedMs",
    label: "Agent elapsed",
    note: "Recorded agent turns",
  },
  {
    value: "taskMs",
    field: "agentTaskMs",
    label: "Agent task time",
    note: "Task and subagent durations; excluded from total to avoid double-counting",
  },
] as const;

export function WorkSummary({
  overview,
  days,
}: {
  readonly overview: WorkOverview | null;
  readonly days: ReadonlyArray<string>;
}) {
  if (!overview) {
    return (
      <p className="py-6 text-sm text-muted-foreground" role="status">
        Loading work overview…
      </p>
    );
  }
  const { totals } = overview;
  return (
    <div className="flex flex-col gap-8">
      <section
        className="grid gap-6 lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]"
        aria-label="Work summary"
      >
        <div className="flex min-w-0 flex-col gap-5">
          <div className="flex flex-col gap-1">
            <span className="text-4xl font-semibold text-foreground tabular-nums">
              {formatWorkDuration(totals.manualMs + totals.agentElapsedMs)}
            </span>
            <span className="text-xs text-muted-foreground">
              Total recorded work · {totals.records.toLocaleString()}{" "}
              {totals.records === 1 ? "record" : "records"}
            </span>
          </div>
          {METRICS.map((entry) => (
            <div key={entry.value} className="flex flex-col gap-1">
              <div className="flex items-baseline justify-between gap-4 text-sm">
                <span className="text-foreground">{entry.label}</span>
                <span className="shrink-0 font-medium text-foreground tabular-nums">
                  {formatWorkDuration(totals[entry.field])}
                </span>
              </div>
              <span className="text-xs text-muted-foreground">{entry.note}</span>
            </div>
          ))}
        </div>
        <div className="flex min-w-0 flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-medium text-foreground">
              {days.length === 1 ? "Today's" : "Daily"} total
            </h2>
          </div>
          {overview.dailyTotals === undefined ? (
            <p className="flex min-h-56 items-center justify-center text-sm text-muted-foreground">
              Daily history is unavailable on this server. Totals are shown separately.
            </p>
          ) : (
            <WorkOverviewChart days={days} dailyTotals={overview.dailyTotals} />
          )}
        </div>
      </section>
      <section className="flex flex-col gap-2" aria-label="Usage totals">
        <h2 className="text-sm font-medium text-foreground">Totals</h2>
        <div className="grid grid-cols-2 gap-x-6 gap-y-4 py-1 md:grid-cols-5">
          <Metric label="Input tokens" value={formatTokens(totals.inputTokens)} />
          <Metric label="Cached input" value={formatTokens(totals.cachedInputTokens)} />
          <Metric label="Output" value={formatTokens(totals.outputTokens)} />
          <Metric label="Reasoning" value={formatTokens(totals.reasoningTokens)} />
          <Metric label="Tool uses" value={totals.toolUses.toLocaleString()} />
        </div>
        <p className="text-xs text-muted-foreground">
          {overview.timeCoverage.active === "unavailable"
            ? "Active time unavailable"
            : `Active ${formatWorkDuration(totals.agentActiveMs)}${overview.timeCoverage.active === "partial" ? " (partial coverage)" : ""}`}
          {" · "}
          {overview.timeCoverage.waiting === "unavailable"
            ? "Waiting time unavailable"
            : `Waiting ${formatWorkDuration(totals.agentWaitingMs)}${overview.timeCoverage.waiting === "partial" ? " (partial coverage)" : ""}`}
          {
            ". Total includes manual and agent elapsed time; overlaps are not deduplicated. Task time is shown separately."
          }
        </p>
      </section>
    </div>
  );
}

function Metric({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-base font-medium text-foreground tabular-nums">{value}</span>
    </div>
  );
}
