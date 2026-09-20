// @effect-diagnostics globalDateInEffect:off -- Report calendar bounds are derived by shared Intl timezone logic.
import {
  type WorkOverviewInput,
  type WorkProfile,
  type WorkRecord,
  WorkRecord as WorkRecordSchema,
  type WorkReport,
  type WorkReportCsvInput,
  type WorkReportSnapshot,
  type WorkReportSnapshotInput,
  type WorkReportInput,
  type WorkReportTransitionInput,
  WorkTrackingError,
} from "@t3tools/contracts";
import { workTimeWindow } from "@t3tools/shared/workTimeWindow";
import * as Clock from "effect/Clock";
import * as Crypto from "effect/Crypto";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { encodeCsvRow, WORK_RECORD_CSV_HEADER, workRecordCsvValues } from "./WorkTrackingCsv.ts";

const nowIso = (milliseconds: number) => DateTime.formatIso(DateTime.makeUnsafe(milliseconds));
const failure = (message: string) => new WorkTrackingError({ message });
const mapSqlError = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  effect.pipe(
    Effect.catchCause(() => Effect.fail(failure("Could not update the local work ledger."))),
  );
const decodeWorkRecord = Schema.decodeUnknownEffect(WorkRecordSchema);
const recordTotals = (records: ReadonlyArray<WorkRecord>) =>
  records.reduce(
    (totals, record) => ({
      manualMs: totals.manualMs + (record.kind === "manual" ? (record.durationMs ?? 0) : 0),
      agentElapsedMs:
        totals.agentElapsedMs + (record.kind === "agent-turn" ? (record.elapsedMs ?? 0) : 0),
      agentActiveMs:
        totals.agentActiveMs + (record.kind === "agent-turn" ? (record.activeMs ?? 0) : 0),
      agentWaitingMs:
        totals.agentWaitingMs + (record.kind === "agent-turn" ? (record.waitingMs ?? 0) : 0),
      agentTaskMs: totals.agentTaskMs + (record.kind === "agent-task" ? (record.taskMs ?? 0) : 0),
      inputTokens: totals.inputTokens + (record.tokens.inputTokens ?? 0),
      cachedInputTokens: totals.cachedInputTokens + (record.tokens.cachedInputTokens ?? 0),
      outputTokens: totals.outputTokens + (record.tokens.outputTokens ?? 0),
      reasoningTokens: totals.reasoningTokens + (record.tokens.reasoningTokens ?? 0),
      toolUses:
        totals.toolUses +
        (record.toolUsage === null
          ? 0
          : Object.values(record.toolUsage).reduce((total, value) => total + value, 0)),
      records: totals.records + 1,
    }),
    {
      manualMs: 0,
      agentElapsedMs: 0,
      agentActiveMs: 0,
      agentWaitingMs: 0,
      agentTaskMs: 0,
      inputTokens: 0,
      cachedInputTokens: 0,
      outputTokens: 0,
      reasoningTokens: 0,
      toolUses: 0,
      records: 0,
    },
  );

interface Dependencies {
  readonly sql: SqlClient.SqlClient;
  readonly crypto: Crypto.Crypto;
  readonly readProfile: Effect.Effect<WorkProfile | null, WorkTrackingError>;
  readonly readRecords: (
    input: WorkOverviewInput,
  ) => Effect.Effect<ReadonlyArray<WorkRecord>, WorkTrackingError>;
}

export const makeWorkTrackingReporting = ({
  sql,
  crypto,
  readProfile,
  readRecords,
}: Dependencies) => {
  const readReportById = Effect.fn("WorkTrackingService.readReportById")(function* (id: string) {
    const row = (yield* mapSqlError(
      sql<
        Omit<WorkReport, "recordIds">
      >`SELECT id, tracking_project_id AS "trackingProjectId", month, status, generated_at AS "generatedAt", status_at AS "statusAt", revision, reference, project_name_snapshot AS "projectNameSnapshot", profile_display_name_snapshot AS "profileDisplayNameSnapshot" FROM work_reports WHERE id = ${id}`,
    ))[0];
    if (!row) return null;
    const members = yield* mapSqlError(
      sql<{
        readonly recordId: string;
      }>`SELECT record_id AS "recordId" FROM work_report_records WHERE report_id = ${id}`,
    );
    return { ...row, recordIds: members.map((member) => member.recordId) } as unknown as WorkReport;
  });
  const createReport = Effect.fn("WorkTrackingService.createReport")(function* (
    input: WorkReportInput,
  ) {
    if (!/^\d{4}-(?:0[1-9]|1[0-2])$/.test(input.month))
      return yield* Effect.fail(failure("Month must use YYYY-MM."));
    return yield* sql.withTransaction(
      Effect.gen(function* () {
        const now = nowIso(yield* Clock.currentTimeMillis);
        const id = yield* crypto.randomUUIDv4;
        const profile = yield* readProfile;
        if (!profile)
          return yield* Effect.fail(failure("Set up a Work profile before creating reports."));
        const project = (yield* mapSqlError(
          sql<{
            readonly name: string;
          }>`SELECT name FROM work_tracking_projects WHERE id = ${input.trackingProjectId}`,
        ))[0];
        if (!project) return yield* Effect.fail(failure("Tracking project not found."));
        const window = workTimeWindow(
          "month",
          profile.timeZone,
          new Date(`${input.month}-15T12:00:00.000Z`),
        );
        const records = yield* mapSqlError(
          sql<{
            readonly id: string;
          }>`SELECT id FROM work_records WHERE tracking_project_id = ${input.trackingProjectId} AND occurred_at >= ${window.since} AND occurred_at < ${window.until} AND supersedes_id IS NULL`,
        );
        yield* mapSqlError(
          sql`INSERT INTO work_reports(id, tracking_project_id, month, status, generated_at, status_at, revision, reference, project_name_snapshot, profile_display_name_snapshot) VALUES (${id}, ${input.trackingProjectId}, ${input.month}, 'open', ${now}, ${now}, 0, ${input.reference ?? null}, ${project.name}, ${profile.displayName})`,
        );
        yield* Effect.forEach(records, (record) =>
          mapSqlError(
            sql`INSERT INTO work_report_records(report_id, record_id) VALUES (${id}, ${record.id})`,
          ),
        );
        return {
          id,
          trackingProjectId: input.trackingProjectId,
          month: input.month,
          status: "open",
          recordIds: records.map((record) => record.id),
          generatedAt: now,
          statusAt: now,
          revision: 0,
          reference: input.reference ?? null,
          projectNameSnapshot: project.name,
          profileDisplayNameSnapshot: profile.displayName,
        } as unknown as WorkReport;
      }),
    );
  });
  const transitionReport = Effect.fn("WorkTrackingService.transitionReport")(function* (
    input: WorkReportTransitionInput,
  ) {
    return yield* sql.withTransaction(
      Effect.gen(function* () {
        const report = yield* readReportById(input.id);
        if (!report) return yield* Effect.fail(failure("Report not found."));
        if (report.status === "invoiced")
          return yield* Effect.fail(failure("Invoiced reports are immutable."));
        if (
          (report.status === "open" && input.status !== "submitted") ||
          (report.status === "submitted" && input.status !== "open" && input.status !== "invoiced")
        )
          return yield* Effect.fail(failure("Invalid report status transition."));
        const now = nowIso(yield* Clock.currentTimeMillis);
        yield* mapSqlError(
          sql`UPDATE work_reports SET status = ${input.status}, status_at = ${now}, reference = ${input.reference ?? report.reference}, revision = revision + 1 WHERE id = ${input.id}`,
        );
        return {
          ...report,
          status: input.status,
          statusAt: now,
          reference: input.reference ?? report.reference,
          revision: report.revision + 1,
        };
      }),
    );
  });
  const exportCsv = Effect.fn("WorkTrackingService.exportCsv")(function* (
    trackingProjectId: string,
    month: string,
  ) {
    if (!/^\d{4}-(?:0[1-9]|1[0-2])$/.test(month))
      return yield* Effect.fail(failure("Month must use YYYY-MM."));
    const profile = yield* readProfile;
    if (!profile)
      return yield* Effect.fail(failure("Set up a Work profile before exporting reports."));
    const window = workTimeWindow("month", profile.timeZone, new Date(`${month}-15T12:00:00.000Z`));
    const records = yield* readRecords({
      since: window.since,
      until: window.until,
      trackingProjectId: trackingProjectId as never,
    });
    return {
      filename: `work-${month}.csv`,
      content: [
        WORK_RECORD_CSV_HEADER.join(","),
        ...records.map((record) => encodeCsvRow(workRecordCsvValues(record))),
      ].join("\n"),
    };
  });
  const exportReportCsv = Effect.fn("WorkTrackingService.exportReportCsv")(function* (
    input: WorkReportCsvInput,
  ) {
    const report = (yield* mapSqlError(
      sql<{
        readonly id: string;
        readonly month: string;
        readonly projectName: string | null;
        readonly profileDisplayName: string | null;
      }>`SELECT id, month, project_name_snapshot AS "projectName", profile_display_name_snapshot AS "profileDisplayName" FROM work_reports WHERE id = ${input.id}`,
    ))[0];
    if (!report) return yield* Effect.fail(failure("Report not found."));
    const rows = yield* mapSqlError(
      sql<
        Record<string, unknown>
      >`SELECT records.id, records.kind, records.tracking_project_id AS "trackingProjectId", records.project_id AS "projectId", records.thread_id AS "threadId", records.turn_id AS "turnId", records.repository_id AS "repositoryId", records.cross_repository = 1 AS "crossRepository", records.occurred_at AS "occurredAt", records.duration_ms AS "durationMs", records.elapsed_ms AS "elapsedMs", records.active_ms AS "activeMs", records.waiting_ms AS "waitingMs", records.task_ms AS "taskMs", records.provider, records.model, records.effort, records.surface, json_object('inputTokens', records.input_tokens, 'cachedInputTokens', records.cached_input_tokens, 'outputTokens', records.output_tokens, 'reasoningTokens', records.reasoning_tokens) AS tokens, records.tool_usage_json AS "toolUsage", records.outcome, records.coverage, records.category, records.note, records.source_event_id AS "sourceEventId", records.revision, records.supersedes_id AS "supersedesId", records.created_at AS "createdAt", records.updated_at AS "updatedAt" FROM work_report_records AS members JOIN work_records AS records ON records.id = members.record_id WHERE members.report_id = ${input.id} ORDER BY records.occurred_at, records.id`,
    );
    const records = yield* Effect.forEach(rows, (row) =>
      decodeWorkRecord({
        ...row,
        crossRepository: row.crossRepository === true || row.crossRepository === 1,
        tokens: JSON.parse(String(row.tokens)),
        toolUsage: row.toolUsage === null ? null : JSON.parse(String(row.toolUsage)),
      }),
    );
    return {
      filename: `work-report-${report.month}.csv`,
      content: [
        [
          "report_id",
          "report_month",
          "project_name",
          "profile_name",
          ...WORK_RECORD_CSV_HEADER,
        ].join(","),
        ...records.map((record) =>
          encodeCsvRow([
            report.id,
            report.month,
            report.projectName ?? "",
            report.profileDisplayName ?? "",
            ...workRecordCsvValues(record),
          ]),
        ),
      ].join("\n"),
    };
  });
  const getReportSnapshot = Effect.fn("WorkTrackingService.getReportSnapshot")(function* (
    input: WorkReportSnapshotInput,
  ) {
    const report = (yield* mapSqlError(
      sql<{
        readonly id: string;
        readonly trackingProjectId: string;
        readonly month: string;
        readonly status: "open" | "submitted" | "invoiced";
        readonly generatedAt: string;
        readonly statusAt: string;
        readonly revision: number;
        readonly reference: string | null;
        readonly projectNameSnapshot: string | null;
        readonly profileDisplayNameSnapshot: string | null;
        readonly projectName: string;
      }>`SELECT reports.id, reports.tracking_project_id AS "trackingProjectId", reports.month, reports.status, reports.generated_at AS "generatedAt", reports.status_at AS "statusAt", reports.revision, reports.reference, reports.project_name_snapshot AS "projectNameSnapshot", reports.profile_display_name_snapshot AS "profileDisplayNameSnapshot", projects.name AS "projectName" FROM work_reports AS reports JOIN work_tracking_projects AS projects ON projects.id = reports.tracking_project_id WHERE reports.id = ${input.id}`,
    ))[0];
    if (!report) return yield* Effect.fail(failure("Report not found."));
    const rows = yield* mapSqlError(
      sql<
        Record<string, unknown>
      >`SELECT records.id, records.kind, records.tracking_project_id AS "trackingProjectId", records.project_id AS "projectId", records.thread_id AS "threadId", records.turn_id AS "turnId", records.repository_id AS "repositoryId", records.cross_repository = 1 AS "crossRepository", records.occurred_at AS "occurredAt", records.duration_ms AS "durationMs", records.elapsed_ms AS "elapsedMs", records.active_ms AS "activeMs", records.waiting_ms AS "waitingMs", records.task_ms AS "taskMs", records.provider, records.model, records.effort, records.surface, json_object('inputTokens', records.input_tokens, 'cachedInputTokens', records.cached_input_tokens, 'outputTokens', records.output_tokens, 'reasoningTokens', records.reasoning_tokens) AS tokens, records.tool_usage_json AS "toolUsage", records.outcome, records.coverage, records.category, records.note, records.source_event_id AS "sourceEventId", records.revision, records.supersedes_id AS "supersedesId", records.created_at AS "createdAt", records.updated_at AS "updatedAt" FROM work_report_records AS members JOIN work_records AS records ON records.id = members.record_id WHERE members.report_id = ${input.id} ORDER BY records.occurred_at, records.id`,
    );
    const records = yield* Effect.forEach(rows, (row) =>
      decodeWorkRecord({
        ...row,
        crossRepository: row.crossRepository === true || row.crossRepository === 1,
        tokens: JSON.parse(String(row.tokens)),
        toolUsage: row.toolUsage === null ? null : JSON.parse(String(row.toolUsage)),
      }),
    ).pipe(Effect.mapError(() => failure("Could not read the local work ledger.")));
    const profile = yield* readProfile;
    return {
      report: { ...report, recordIds: records.map((record) => record.id) },
      projectName: report.projectNameSnapshot ?? report.projectName,
      profileDisplayName: report.profileDisplayNameSnapshot ?? profile?.displayName ?? null,
      profile,
      records,
      totals: recordTotals(records),
    } as unknown as WorkReportSnapshot;
  });
  return { createReport, transitionReport, exportCsv, exportReportCsv, getReportSnapshot };
};
