import { useAtomValue } from "@effect/atom-react";
import type { EnvironmentId, WorkReportId, WorkReportSnapshot } from "@t3tools/contracts";
import * as Option from "effect/Option";
import { AsyncResult } from "effect/unstable/reactivity";
import { useEffect, useRef } from "react";

import { serverEnvironment } from "../../state/server";

const minutes = (value: number | null) => (value === null ? "—" : `${Math.round(value / 60_000)}m`);
const count = (value: number) => value.toLocaleString();

export const shouldPrintSnapshot = (snapshot: WorkReportSnapshot | null, reportId: WorkReportId) =>
  snapshot?.report.id === reportId;

export function WorkReportSnapshotPrint({
  environmentId,
  reportId,
  onPrinted,
}: {
  readonly environmentId: EnvironmentId;
  readonly reportId: WorkReportId;
  readonly onPrinted: () => void;
}) {
  const result = useAtomValue(
    serverEnvironment.workReportSnapshot({ environmentId, input: { id: reportId } }),
  );
  const snapshot = Option.getOrNull(AsyncResult.value(result));
  const printed = useRef<WorkReportId | null>(null);
  useEffect(() => {
    if (shouldPrintSnapshot(snapshot, reportId) && printed.current !== reportId) {
      printed.current = reportId;
      window.print();
      onPrinted();
    }
  }, [onPrinted, reportId, snapshot]);
  if (!snapshot) return null;
  return (
    <section className="work-print-snapshot hidden print:block">
      <style>{`@media print { body * { visibility: hidden; } .work-print-snapshot, .work-print-snapshot * { visibility: visible; } .work-print-snapshot { position: absolute; inset: 0; padding: 24px; } }`}</style>
      <h1>Work report · {snapshot.report.month}</h1>
      <p>
        {snapshot.projectName} · {snapshot.report.status} · Generated {snapshot.report.generatedAt}
      </p>
      {snapshot.profileDisplayName ? <p>Prepared for {snapshot.profileDisplayName}</p> : null}
      <p>
        Developer {minutes(snapshot.totals.manualMs)} · Agent elapsed{" "}
        {minutes(snapshot.totals.agentElapsedMs)} · Task time {minutes(snapshot.totals.agentTaskMs)}
      </p>
      <p>
        Tokens · Input {count(snapshot.totals.inputTokens)} · Cached input{" "}
        {count(snapshot.totals.cachedInputTokens)} · Output {count(snapshot.totals.outputTokens)} ·{" "}
        Reasoning {count(snapshot.totals.reasoningTokens)} · Tool uses{" "}
        {count(snapshot.totals.toolUses)}
      </p>
      <table className="mt-4 w-full border-collapse text-left text-sm">
        <thead>
          <tr className="border-b">
            <th>Date</th>
            <th>Kind</th>
            <th>Developer</th>
            <th>Agent elapsed</th>
            <th>Task time</th>
            <th>Outcome</th>
          </tr>
        </thead>
        <tbody>
          {snapshot.records.map((record) => (
            <tr key={record.id} className="border-b">
              <td>{record.occurredAt}</td>
              <td>{record.kind}</td>
              <td>{minutes(record.durationMs)}</td>
              <td>{minutes(record.elapsedMs)}</td>
              <td>{minutes(record.taskMs)}</td>
              <td>{record.outcome}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
