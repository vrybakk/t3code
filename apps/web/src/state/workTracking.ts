import type {
  EnvironmentId,
  WorkManualEntryInput,
  WorkImportInput,
  WorkProfileInput,
  WorkProjectInput,
  WorkRepositoryInput,
  WorkDeliveryId,
  WorkReportId,
  ThreadId,
  WorkReportStatus,
  WorkTrackingProjectId,
} from "@t3tools/contracts";
import { workTimeWindow, type WorkWindowKind } from "@t3tools/shared/workTimeWindow";
import { useCallback } from "react";

import { appAtomRegistry } from "../rpc/atomRegistry";
import { serverEnvironment } from "./server";
import { useAtomCommand } from "./use-atom-command";

export const workWindow = (
  kind: WorkWindowKind = "month",
  timeZone = browserTimeZone(),
  referenceDate = new Date(),
) => workTimeWindow(kind, timeZone, referenceDate);

export const parseDurationMinutes = (value: string): number | null => {
  const minutes = Number(value);
  return Number.isFinite(minutes) && minutes >= 0 ? Math.round(minutes * 60_000) : null;
};

const pad = (value: number) => String(value).padStart(2, "0");
export const formatLocalDateTime = (instant: string | Date) => {
  const date = typeof instant === "string" ? new Date(instant) : instant;
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};
export const localDateTimeToIso = (value: string) => {
  const parts = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!parts) return null;
  const [, yearText = "", monthText = "", dayText = "", hourText = "", minuteText = ""] = parts;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const local = new Date(year, month - 1, day, hour, minute);
  if (
    Number.isNaN(local.valueOf()) ||
    local.getFullYear() !== year ||
    local.getMonth() !== month - 1 ||
    local.getDate() !== day ||
    local.getHours() !== hour ||
    local.getMinutes() !== minute
  )
    return null;
  return local.toISOString();
};

export const workReportActions = (status: WorkReportStatus) =>
  status === "open" ? ["submitted"] : status === "submitted" ? ["open", "invoiced"] : [];

export const browserTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

export function useWorkMutations(environmentId: EnvironmentId) {
  const profile = useAtomCommand(serverEnvironment.upsertWorkProfile, { reportFailure: false });
  const project = useAtomCommand(serverEnvironment.upsertWorkProject, { reportFailure: false });
  const repository = useAtomCommand(serverEnvironment.upsertWorkRepository, {
    reportFailure: false,
  });
  const manual = useAtomCommand(serverEnvironment.upsertWorkManualEntry, { reportFailure: false });
  const delivery = useAtomCommand(serverEnvironment.markWorkDelivery, { reportFailure: false });
  const reopenDelivery = useAtomCommand(serverEnvironment.reopenWorkDelivery, {
    reportFailure: false,
  });
  const report = useAtomCommand(serverEnvironment.createWorkReport, { reportFailure: false });
  const transitionReport = useAtomCommand(serverEnvironment.transitionWorkReport, {
    reportFailure: false,
  });
  const exportJson = useAtomCommand(serverEnvironment.exportWorkJson, { reportFailure: false });
  const importJson = useAtomCommand(serverEnvironment.importWorkJson, { reportFailure: false });
  const exportCsv = useAtomCommand(serverEnvironment.exportWorkCsv, { reportFailure: false });
  const exportReportCsv = useAtomCommand(serverEnvironment.exportWorkReportCsv, {
    reportFailure: false,
  });
  const refresh = useCallback(() => {
    appAtomRegistry.update(serverEnvironment.workRevisionAtom(environmentId), (value) => value + 1);
  }, [environmentId]);
  const run = useCallback(
    async <A, R extends { readonly _tag: string }>(
      command: (value: { readonly environmentId: EnvironmentId; readonly input: A }) => Promise<R>,
      input: A,
    ): Promise<R> => {
      const result = await command({ environmentId, input });
      if (result._tag === "Success") refresh();
      return result;
    },
    [environmentId, refresh],
  );
  return {
    refresh,
    saveProfile: (input: WorkProfileInput) => run(profile, input),
    saveProject: (input: WorkProjectInput) => run(project, input),
    saveRepository: (input: WorkRepositoryInput) => run(repository, input),
    saveManual: (input: WorkManualEntryInput) => run(manual, input),
    markDelivery: (input: {
      trackingProjectId: WorkTrackingProjectId;
      threadId: ThreadId | null;
    }) => run(delivery, input),
    reopenDelivery: (input: { id: WorkDeliveryId }) => run(reopenDelivery, input),
    createReport: (input: {
      trackingProjectId: WorkTrackingProjectId;
      month: string;
      reference?: string;
    }) => run(report, input),
    transitionReport: (input: {
      id: WorkReportId;
      status: "open" | "submitted" | "invoiced";
      reference?: string;
    }) => run(transitionReport, input),
    exportJson: () => exportJson({ environmentId, input: {} }),
    importJson: (input: WorkImportInput) => run(importJson, input),
    exportCsv: (input: { trackingProjectId: WorkTrackingProjectId; month: string }) =>
      exportCsv({ environmentId, input }),
    exportReportCsv: (input: { id: WorkReportId }) => exportReportCsv({ environmentId, input }),
  };
}
