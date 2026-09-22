import type { WorkOverview } from "@t3tools/contracts";
import { WorkPath } from "./WorkPath";

const duration = (value: number) => `${Math.round(value / 60_000)}m`;

export function WorkBreakdown({ overview }: { readonly overview: WorkOverview }) {
  return (
    <section className="rounded-lg border p-5" aria-labelledby="work-breakdown-heading">
      <h2 id="work-breakdown-heading" className="font-medium">
        Project and record breakdown
      </h2>
      <div className="mt-3 space-y-2 text-sm">
        {overview.projectTotals.length === 0 ? (
          <p className="text-muted-foreground">No current work in this window.</p>
        ) : (
          overview.projectTotals.map((summary) => {
            const project = overview.projects.find((item) => item.id === summary.trackingProjectId);
            return (
              <div key={summary.trackingProjectId} className="rounded-md border p-3">
                <p className="font-medium">{project?.name ?? "Archived tracking project"}</p>
                <p className="text-muted-foreground">
                  Developer {duration(summary.totals.manualMs)} · Agent elapsed{" "}
                  {duration(summary.totals.agentElapsedMs)} · Tasks{" "}
                  {duration(summary.totals.agentTaskMs)}
                </p>
                {project?.repositories.length ? (
                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                    {project.repositories
                      .filter((repository) => repository.inclusion === "included")
                      .map((repository) => {
                        const involvement = overview.repositoryInvolvement.find(
                          (item) => item.repositoryId === repository.id,
                        );
                        return (
                          <div
                            key={repository.id}
                            className="flex min-w-0 max-w-full items-center gap-2 rounded-md bg-muted/50 px-2 py-1"
                          >
                            <WorkPath path={repository.localRoot} />
                            {involvement?.records ? (
                              <span className="shrink-0 tabular-nums">
                                {involvement.records} records
                              </span>
                            ) : null}
                          </div>
                        );
                      })}
                  </div>
                ) : null}
              </div>
            );
          })
        )}
      </div>
      <div className="mt-4 space-y-2 text-sm">
        <h3 className="font-medium">Recent records and adjustments</h3>
        {[...overview.records, ...overview.adjustments].slice(0, 12).map((record) => (
          <p key={record.id} className="rounded-md border p-2">
            {record.occurredAt.slice(0, 10)} · {record.kind}
            {record.revision > 0 ? " · Current adjustment" : ""}
            {record.supersedesId ? " · Superseded history" : ""}
            {` · ${record.provider ?? "Provider unavailable"} · ${record.model ?? "Model unavailable"} · ${record.outcome} · ${record.coverage}`}
          </p>
        ))}
      </div>
    </section>
  );
}
