import type { WorkOverview } from "@t3tools/contracts";

const duration = (value: number) => `${Math.round(value / 60_000)}m`;

export function WorkSummary({
  summaries,
}: {
  readonly summaries: ReadonlyArray<{
    readonly label: string;
    readonly overview: WorkOverview | null;
  }>;
}) {
  return (
    <section className="grid gap-3 lg:grid-cols-3" aria-label="Work summaries">
      {summaries.map(({ label, overview }) => (
        <div key={label} className="rounded-lg border p-4">
          <h2 className="font-medium">{label}</h2>
          {overview ? (
            <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
              <Metric label="Developer" value={duration(overview.totals.manualMs)} />
              <Metric label="Agent elapsed" value={duration(overview.totals.agentElapsedMs)} />
              <Metric label="Task time" value={duration(overview.totals.agentTaskMs)} />
              <AvailabilityMetric overview={overview} field="activeMs" label="Active" />
              <AvailabilityMetric overview={overview} field="waitingMs" label="Waiting" />
            </div>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">No data is available.</p>
          )}
        </div>
      ))}
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
  return (
    <Metric label={`${label} (${state})`} value={state === "unavailable" ? "—" : duration(total)} />
  );
}

function Metric({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div>
      <p className="text-muted-foreground">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  );
}
