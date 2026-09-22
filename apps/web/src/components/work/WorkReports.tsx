import type { WorkReport, WorkTrackingProject } from "@t3tools/contracts";
import { useEffect, useState } from "react";

import { workReportActions } from "../../state/workTracking";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { WorkSelect } from "./WorkSelect";

const validMonth = (value: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(value);

export function WorkReports({
  projects,
  reports,
  defaultMonth,
  pending,
  onCreate,
  onTransition,
  onCsv,
  onSnapshotCsv,
  onPrintSnapshot,
}: {
  readonly projects: ReadonlyArray<WorkTrackingProject>;
  readonly reports: ReadonlyArray<WorkReport>;
  readonly defaultMonth: string;
  readonly pending: boolean;
  readonly onCreate: (input: {
    trackingProjectId: WorkTrackingProject["id"];
    month: string;
    reference?: string;
  }) => Promise<boolean>;
  readonly onTransition: (input: {
    id: WorkReport["id"];
    status: "open" | "submitted" | "invoiced";
    reference?: string;
  }) => Promise<boolean>;
  readonly onCsv: (trackingProjectId: WorkTrackingProject["id"], month: string) => Promise<void>;
  readonly onSnapshotCsv: (id: WorkReport["id"]) => Promise<void>;
  readonly onPrintSnapshot: (id: WorkReport["id"]) => void;
}) {
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const [month, setMonth] = useState(defaultMonth);
  useEffect(() => {
    if (!validMonth(defaultMonth)) return;
    setMonth((current) => current || defaultMonth);
  }, [defaultMonth]);
  useEffect(() => {
    if (projects.some((project) => project.id === projectId)) return;
    setProjectId(projects[0]?.id ?? "");
  }, [projectId, projects]);
  const [reference, setReference] = useState("");
  const [reportReferences, setReportReferences] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const reportReference = (report: WorkReport) =>
    reportReferences[report.id]?.trim() || report.reference || undefined;
  const transition = (
    id: WorkReport["id"],
    status: "open" | "submitted" | "invoiced",
    nextReference: string | undefined,
  ) =>
    nextReference === undefined
      ? onTransition({ id, status })
      : onTransition({ id, status, reference: nextReference });
  const create = async () => {
    if (!projectId || !validMonth(month))
      return setError("Choose a project and a valid YYYY-MM month.");
    setError("");
    await onCreate({
      trackingProjectId: projectId as WorkTrackingProject["id"],
      month,
      ...(reference.trim() ? { reference: reference.trim() } : {}),
    });
  };
  return (
    <section className="rounded-lg border p-5" aria-labelledby="work-reports-heading">
      <h2 id="work-reports-heading" className="font-medium">
        Reports
      </h2>
      <div className="mt-4 grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="grid min-w-0 gap-1.5">
          <Label htmlFor="work-report-project">Tracking project</Label>
          <WorkSelect
            id="work-report-project"
            value={projectId}
            onValueChange={setProjectId}
            options={projects.map((project) => ({ value: project.id, label: project.name }))}
          />
        </div>
        <div className="grid min-w-0 gap-1.5">
          <Label htmlFor="work-report-month">Month</Label>
          <Input
            id="work-report-month"
            type="month"
            value={month}
            onChange={(event) => setMonth(event.target.value)}
            placeholder="2026-09"
          />
        </div>
        <div className="grid min-w-0 gap-1.5 sm:col-span-2 lg:col-span-1">
          <Label htmlFor="work-report-reference">Reference (optional)</Label>
          <Input
            id="work-report-reference"
            value={reference}
            onChange={(event) => setReference(event.target.value)}
          />
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button disabled={pending || !projects.length} onClick={() => void create()}>
          Create snapshot
        </Button>
        <Button
          variant="outline"
          disabled={pending || !projectId || !validMonth(month)}
          onClick={() => void onCsv(projectId as WorkTrackingProject["id"], month)}
        >
          Download CSV
        </Button>
      </div>
      {error ? (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div className="mt-4 space-y-2 text-sm">
        {reports.length === 0 ? (
          <p className="text-muted-foreground">No report snapshots yet.</p>
        ) : (
          reports.map((report) => (
            <div key={report.id} className="rounded-md border p-3">
              <p className="font-medium">
                {report.month} · {report.status} · {report.recordIds.length} records
              </p>
              <p className="text-muted-foreground">
                Generated {report.generatedAt.slice(0, 10)} · Status {report.statusAt.slice(0, 10)}
                {report.reference ? ` · ${report.reference}` : ""}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() => void onSnapshotCsv(report.id)}
                >
                  Download snapshot CSV
                </Button>
                <Button size="sm" variant="outline" onClick={() => onPrintSnapshot(report.id)}>
                  Print snapshot
                </Button>
              </div>
              {report.status !== "invoiced" ? (
                <Input
                  className="mt-2 max-w-sm"
                  aria-label={`Reference for ${report.month}`}
                  value={reportReferences[report.id] ?? report.reference ?? ""}
                  onChange={(event) =>
                    setReportReferences((current) => ({
                      ...current,
                      [report.id]: event.target.value,
                    }))
                  }
                  placeholder="Reference (optional)"
                />
              ) : null}
              {workReportActions(report.status).includes("submitted") ? (
                <Button
                  className="mt-2"
                  size="sm"
                  disabled={pending}
                  onClick={() => void transition(report.id, "submitted", reportReference(report))}
                >
                  Submit
                </Button>
              ) : workReportActions(report.status).includes("invoiced") ? (
                <div className="mt-2 flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pending}
                    onClick={() => void transition(report.id, "open", reportReference(report))}
                  >
                    Withdraw
                  </Button>
                  <Button
                    size="sm"
                    disabled={pending}
                    onClick={() => void transition(report.id, "invoiced", reportReference(report))}
                  >
                    Mark invoiced
                  </Button>
                </div>
              ) : (
                <p className="mt-2 text-muted-foreground">Invoiced snapshots are immutable.</p>
              )}
            </div>
          ))
        )}
      </div>
    </section>
  );
}
