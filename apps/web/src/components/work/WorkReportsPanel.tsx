import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/shell";
import type {
  EnvironmentId,
  WorkOverview,
  WorkRecord,
  WorkReportId,
  WorkTrackingProjectId,
} from "@t3tools/contracts";
import { useState } from "react";
import { useWorkMutations } from "../../state/workTracking";
import { WorkActivity } from "./WorkActivity";
import { WorkDeliveries } from "./WorkDeliveries";
import { WorkMonthlyReport } from "./WorkMonthlyReport";
import { WorkReports } from "./WorkReports";
import { WorkReportSnapshotPrint } from "./WorkReportSnapshotPrint";

export function WorkReportsPanel({
  active,
  environmentId,
  overview,
  timeZone,
  threads,
  onEdit,
}: {
  active: boolean;
  environmentId: EnvironmentId;
  overview: WorkOverview;
  timeZone: string;
  threads: ReadonlyArray<EnvironmentThreadShell>;
  onEdit: (record: WorkRecord) => void;
}) {
  const [month, setMonth] = useState(() => {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
    }).formatToParts(new Date());
    return `${parts.find((part) => part.type === "year")?.value}-${parts.find((part) => part.type === "month")?.value}`;
  });
  const [projectId, setProjectId] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [printReportId, setPrintReportId] = useState<WorkReportId | null>(null);
  const mutations = useWorkMutations(environmentId);
  const perform = async <T extends { readonly _tag: string }>(operation: () => Promise<T>) => {
    setPending(true);
    setError("");
    try {
      const response = await operation();
      if (response._tag === "Success") return true;
      setError("Could not save this Work change. Check the environment connection and try again.");
      return false;
    } finally {
      setPending(false);
    }
  };
  const download = (filename: string, content: string) => {
    const url = URL.createObjectURL(new Blob([content], { type: "text/csv" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  };
  const exportCsv = async (
    trackingProjectId: WorkTrackingProjectId | undefined,
    reportMonth: string,
  ) => {
    const result = await mutations.exportCsv({
      ...(trackingProjectId ? { trackingProjectId } : {}),
      month: reportMonth,
    });
    if (result._tag === "Success") download(result.value.filename, result.value.content);
    else throw new Error("Could not export the CSV report.");
  };
  return (
    <div className="space-y-8">
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <WorkMonthlyReport
        active={active}
        environmentId={environmentId}
        projects={overview.projects}
        timeZone={timeZone}
        month={month}
        onMonthChange={setMonth}
        projectId={projectId}
        onProjectChange={setProjectId}
        onCsv={exportCsv}
      />
      <details className="rounded-lg border p-5">
        <summary className="cursor-pointer text-sm font-medium">
          Project snapshots and delivery
        </summary>
        <div className="mt-5 space-y-5">
          <WorkDeliveries
            projects={overview.projects}
            threads={threads}
            deliveries={overview.deliveries}
            pending={pending}
            onMark={(trackingProjectId, threadId) =>
              perform(() => mutations.markDelivery({ trackingProjectId, threadId }))
            }
            onReopen={(id) => perform(() => mutations.reopenDelivery({ id }))}
          />
          <WorkReports
            key={timeZone}
            projects={overview.projects}
            reports={overview.reports}
            defaultMonth={month}
            pending={pending}
            onCreate={(input) => perform(() => mutations.createReport(input))}
            onTransition={(input) => perform(() => mutations.transitionReport(input))}
            onCsv={async (id, value) => {
              try {
                await exportCsv(id, value);
              } catch {
                setError("Could not export the CSV report.");
              }
            }}
            onSnapshotCsv={async (id) => {
              const result = await mutations.exportReportCsv({ id });
              if (result._tag === "Success") download(result.value.filename, result.value.content);
              else setError("Could not export the immutable report snapshot.");
            }}
            onPrintSnapshot={setPrintReportId}
          />
        </div>
      </details>
      <WorkActivity
        key={`${timeZone}:${month}`}
        active={active}
        environmentId={environmentId}
        projects={overview.projects}
        timeZone={timeZone}
        month={month}
        projectId={projectId}
        onEdit={onEdit}
      />
      {printReportId ? (
        <WorkReportSnapshotPrint
          environmentId={environmentId}
          reportId={printReportId}
          onPrinted={() => setPrintReportId(null)}
        />
      ) : null}
    </div>
  );
}
