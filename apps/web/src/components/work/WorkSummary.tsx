import type { WorkOverview } from "@t3tools/contracts";
import { useState } from "react";

import { Toggle, ToggleGroup } from "../ui/toggle-group";

const duration = (value: number) => `${Math.round(value / 60_000)}m`;
const count = (value: number) => value.toLocaleString();

export function WorkSummary({
  summaries,
}: {
  readonly summaries: ReadonlyArray<{
    readonly label: string;
    readonly overview: WorkOverview | null;
  }>;
}) {
  const [selectedLabel, setSelectedLabel] = useState(
    () => summaries.at(-1)?.label ?? summaries[0]?.label ?? "",
  );
  const selected = summaries.find((summary) => summary.label === selectedLabel) ?? summaries[0];
  const overview = selected?.overview ?? null;
  const unavailable =
    overview?.timeCoverage.active === "unavailable" ||
    overview?.timeCoverage.waiting === "unavailable";
  return (
    <section className="rounded-lg border p-5" aria-labelledby="work-summary-heading">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="work-summary-heading" className="font-medium">
            Overview
          </h2>
          <p className="text-sm text-muted-foreground">Developer time and agent activity.</p>
        </div>
        <ToggleGroup
          aria-label="Work period"
          value={[selected?.label ?? ""]}
          onValueChange={(value) => {
            const label = value[0];
            if (label) setSelectedLabel(label);
          }}
        >
          {summaries.map((summary) => (
            <Toggle key={summary.label} value={summary.label}>
              {summary.label}
            </Toggle>
          ))}
        </ToggleGroup>
      </div>
      {overview ? (
        <>
          <div className="mt-6 grid gap-x-6 gap-y-4 text-sm sm:grid-cols-3 lg:grid-cols-5">
            <Metric label="Developer time" value={duration(overview.totals.manualMs)} />
            <Metric label="Agent elapsed" value={duration(overview.totals.agentElapsedMs)} />
            <Metric label="Agent task time" value={duration(overview.totals.agentTaskMs)} />
            <AvailabilityMetric overview={overview} field="activeMs" label="Active" />
            <AvailabilityMetric overview={overview} field="waitingMs" label="Waiting" />
          </div>
          <div className="mt-5 border-t pt-4">
            <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Usage
            </h3>
            <div className="mt-3 grid gap-x-6 gap-y-4 text-sm sm:grid-cols-3 lg:grid-cols-5">
              <Metric label="Input tokens" value={count(overview.totals.inputTokens)} />
              <Metric label="Cached input" value={count(overview.totals.cachedInputTokens)} />
              <Metric label="Output tokens" value={count(overview.totals.outputTokens)} />
              <Metric label="Reasoning tokens" value={count(overview.totals.reasoningTokens)} />
              <Metric label="Tool uses" value={count(overview.totals.toolUses)} />
            </div>
          </div>
          {unavailable ? (
            <p className="mt-4 text-xs text-muted-foreground">
              Active and waiting time appear when the provider supplies them.
            </p>
          ) : null}
        </>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">No data is available.</p>
      )}
    </section>
  );
}

function AvailabilityMetric({
  overview,
  field,
  label,
}: {
  readonly overview: WorkOverview;
  readonly field: "activeMs" | "waitingMs";
  readonly label: string;
}) {
  const state = overview.timeCoverage[field === "activeMs" ? "active" : "waiting"];
  const total =
    field === "activeMs" ? overview.totals.agentActiveMs : overview.totals.agentWaitingMs;
  return <Metric label={label} value={state === "unavailable" ? "—" : duration(total)} />;
}

function Metric({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-muted-foreground">{label}</p>
      <p className="font-medium tabular-nums">{value}</p>
    </div>
  );
}
