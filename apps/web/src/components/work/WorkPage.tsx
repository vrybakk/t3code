import { useAtomValue } from "@effect/atom-react";
import {
  type EnvironmentId,
  PRIMARY_LOCAL_ENVIRONMENT_ID,
  type WorkExport,
  type WorkReportId,
  type WorkTrackingProject,
} from "@t3tools/contracts";
import * as Option from "effect/Option";
import { AsyncResult } from "effect/unstable/reactivity";
import { useMemo, useState } from "react";

import { isElectron } from "../../env";
import { usePrimaryEnvironmentId } from "../../state/environments";
import { useThreadShells } from "../../state/entities";
import { serverEnvironment } from "../../state/server";
import { browserTimeZone, useWorkMutations, workWindow } from "../../state/workTracking";
import { ScrollArea } from "../ui/scroll-area";
import { SidebarInset } from "../ui/sidebar";
import { WorkspacePageContainer } from "../WorkspacePageContainer";
import { WorkspacePageHeader } from "../WorkspacePageHeader";
import { WorkBackupActions } from "./WorkBackupActions";
import { WorkBreakdown } from "./WorkBreakdown";
import { WorkDeliveries } from "./WorkDeliveries";
import { WorkManualEntries } from "./WorkManualEntries";
import { WorkProfileForm } from "./WorkProfileForm";
import { WorkReports } from "./WorkReports";
import { WorkReportSnapshotPrint } from "./WorkReportSnapshotPrint";
import { WorkRepositoryReview } from "./WorkRepositoryReview";
import { WorkSummary } from "./WorkSummary";

const monthInTimeZone = (timeZone: string) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());
  return `${parts.find((part) => part.type === "year")?.value}-${parts.find((part) => part.type === "month")?.value}`;
};

export function WorkPage() {
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  const environmentId = primaryEnvironmentId ?? (PRIMARY_LOCAL_ENVIRONMENT_ID as EnvironmentId);
  const browserZone = useMemo(() => browserTimeZone(), []);
  const bootstrapWindow = useMemo(() => workWindow("month", browserZone), [browserZone]);
  const bootstrap = useAtomValue(
    serverEnvironment.workOverview({ environmentId, input: bootstrapWindow }),
  );
  const bootstrapOverview = Option.getOrNull(AsyncResult.value(bootstrap));
  const timeZone = bootstrapOverview?.profile?.timeZone ?? browserZone;
  const windows = useMemo(
    () => ({
      today: workWindow("today", timeZone),
      week: workWindow("week", timeZone),
      month: workWindow("month", timeZone),
    }),
    [timeZone],
  );
  const todayResult = useAtomValue(
    serverEnvironment.workOverview({ environmentId, input: windows.today }),
  );
  const weekResult = useAtomValue(
    serverEnvironment.workOverview({ environmentId, input: windows.week }),
  );
  const monthResult = useAtomValue(
    serverEnvironment.workOverview({ environmentId, input: windows.month }),
  );
  const overview = Option.getOrNull(AsyncResult.value(monthResult));
  const threads = useThreadShells().filter((thread) => thread.environmentId === environmentId);
  const mutations = useWorkMutations(environmentId);
  const [manualMonth, setManualMonth] = useState(() => monthInTimeZone(browserZone));
  const manualWindow = useMemo(
    () => workWindow("month", timeZone, new Date(`${manualMonth}-15T12:00:00.000Z`)),
    [manualMonth, timeZone],
  );
  const manualMonthResult = useAtomValue(
    serverEnvironment.workManualRecords({ environmentId, input: manualWindow }),
  );
  const manualMonthRecords = Option.getOrNull(AsyncResult.value(manualMonthResult)) ?? [];
  const [selectedId, setSelectedId] = useState<WorkTrackingProject["id"] | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [printReportId, setPrintReportId] = useState<WorkReportId | null>(null);
  const selected =
    overview?.projects.find((project) => project.id === selectedId) ??
    overview?.projects[0] ??
    null;
  const perform = async <T extends { readonly _tag: string }>(operation: () => Promise<T>) => {
    setPending(true);
    setError("");
    const response = await operation();
    setPending(false);
    if (response._tag === "Success") return response;
    setError("Could not save this Work change. Check the local server connection and try again.");
    return null;
  };
  const download = (filename: string, content: string) => {
    const url = URL.createObjectURL(new Blob([content], { type: "text/csv" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  };
  return (
    <SidebarInset className="h-dvh min-h-0 overflow-hidden overscroll-y-none bg-background text-foreground isolate">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-background text-foreground">
        <WorkspacePageHeader electron={isElectron}>
          <h1>Work</h1>
        </WorkspacePageHeader>
        <ScrollArea className="min-h-0 flex-1">
          <WorkspacePageContainer width="expanded" className="space-y-6 py-6">
            {bootstrap.waiting ? (
              <p className="text-sm text-muted-foreground">Loading local work ledger…</p>
            ) : null}
            {overview === null && !bootstrap.waiting ? (
              <p className="text-sm text-muted-foreground">
                Work is unavailable for this environment.
              </p>
            ) : null}
            {overview ? (
              <>
                {error ? (
                  <p
                    role="alert"
                    className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
                  >
                    {error}
                  </p>
                ) : null}
                <WorkProfileForm
                  key={overview.profile?.id ?? "onboarding"}
                  profile={overview.profile}
                  pending={pending}
                  onSave={async (input) => {
                    await perform(() => mutations.saveProfile(input));
                  }}
                />
                <WorkSummary
                  summaries={[
                    { label: "Today", overview: Option.getOrNull(AsyncResult.value(todayResult)) },
                    {
                      label: "This week",
                      overview: Option.getOrNull(AsyncResult.value(weekResult)),
                    },
                    { label: "This month", overview },
                  ]}
                />
                <details className="group rounded-lg border">
                  <summary className="cursor-pointer list-none px-5 py-4 marker:hidden">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <h2 className="font-medium">Tracking settings</h2>
                        <p className="text-sm text-muted-foreground">
                          T3 projects and nested Git repositories are included automatically.
                        </p>
                      </div>
                      <span className="text-sm text-muted-foreground group-open:hidden">
                        Manage
                      </span>
                      <span className="hidden text-sm text-muted-foreground group-open:inline">
                        Close
                      </span>
                    </div>
                  </summary>
                  <div className="space-y-4 border-t p-4">
                    {overview.projects.length > 1 ? (
                      <label className="grid max-w-md gap-1.5 text-sm font-medium">
                        Tracking project
                        <select
                          className="h-9 rounded-md border bg-background px-3 font-normal"
                          value={selected?.id ?? ""}
                          onChange={(event) =>
                            setSelectedId(event.target.value as WorkTrackingProject["id"])
                          }
                        >
                          {overview.projects.map((project) => (
                            <option key={project.id} value={project.id}>
                              {project.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : null}
                    {selected ? (
                      <WorkRepositoryReview
                        environmentId={environmentId}
                        project={selected}
                        pending={pending}
                        onSave={async (input) =>
                          (await perform(() =>
                            mutations.saveRepository({ trackingProjectId: selected.id, ...input }),
                          )) !== null
                        }
                      />
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        Tracking projects appear automatically for local T3 projects.
                      </p>
                    )}
                  </div>
                </details>
                <WorkManualEntries
                  key={`manual-entries:${manualMonth}:${overview.projects.map((project) => project.id).join(":")}`}
                  projects={overview.projects}
                  threads={threads}
                  records={manualMonthRecords}
                  month={manualMonth}
                  monthLoading={manualMonthResult.waiting}
                  pending={pending}
                  onMonthChange={setManualMonth}
                  onSave={async (input) =>
                    (await perform(() => mutations.saveManual(input as never))) !== null
                  }
                />
                <WorkBreakdown overview={overview} />
                <WorkDeliveries
                  projects={overview.projects}
                  threads={threads}
                  deliveries={overview.deliveries}
                  pending={pending}
                  onMark={async (trackingProjectId, threadId) =>
                    (await perform(() =>
                      mutations.markDelivery({ trackingProjectId, threadId }),
                    )) !== null
                  }
                  onReopen={async (id) =>
                    (await perform(() => mutations.reopenDelivery({ id }))) !== null
                  }
                />
                <WorkReports
                  key={timeZone}
                  projects={overview.projects}
                  reports={overview.reports}
                  defaultMonth={monthInTimeZone(timeZone)}
                  pending={pending}
                  onCreate={async (input) =>
                    (await perform(() => mutations.createReport(input))) !== null
                  }
                  onTransition={async (input) =>
                    (await perform(() => mutations.transitionReport(input))) !== null
                  }
                  onCsv={async (trackingProjectId, month) => {
                    const result = await mutations.exportCsv({ trackingProjectId, month });
                    if (result._tag === "Success")
                      download(result.value.filename, result.value.content);
                    else setError("Could not export the CSV report.");
                  }}
                  onSnapshotCsv={async (id) => {
                    const result = await mutations.exportReportCsv({ id });
                    if (result._tag === "Success")
                      download(result.value.filename, result.value.content);
                    else setError("Could not export the immutable report snapshot.");
                  }}
                  onPrintSnapshot={setPrintReportId}
                />
                <WorkBackupActions
                  pending={pending}
                  onExport={async () => {
                    const result = await mutations.exportJson();
                    if (result._tag === "Success") return result.value as WorkExport;
                    setError("Could not export the JSON backup.");
                    return null;
                  }}
                  onImport={async (backup) =>
                    (await perform(() => mutations.importJson({ mode: "merge", backup }))) !== null
                  }
                />
                {printReportId ? (
                  <WorkReportSnapshotPrint
                    environmentId={environmentId}
                    reportId={printReportId}
                    onPrinted={() => setPrintReportId(null)}
                  />
                ) : null}
                <p className="text-xs text-muted-foreground">
                  Reporting timezone: {timeZone}. Active and waiting time remain unavailable when
                  provider events do not supply them.
                </p>
              </>
            ) : null}
          </WorkspacePageContainer>
        </ScrollArea>
      </div>
    </SidebarInset>
  );
}
