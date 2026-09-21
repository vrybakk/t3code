import {
  type WorkDelivery,
  type WorkExport,
  type WorkImportInput,
  type WorkManualEntryInput,
  type WorkOverview,
  type WorkOverviewInput,
  type WorkProjectTotals,
  type WorkRepositoryInvolvement,
  type WorkProfile,
  type WorkProfileInput,
  type WorkRecord as WorkRecordValue,
  type WorkReport,
  type WorkReportCsvInput,
  type WorkReportSnapshot,
  type WorkReportSnapshotInput,
  type WorkReportInput,
  type WorkReportTransitionInput,
  type WorkRepository,
  type WorkRepositoryDiscovery,
  type WorkRepositoryDiscoveryInput,
  type WorkRepositoryInput,
  type WorkTrackingProject,
  type WorkProjectInput,
  WorkRecord,
  WorkTrackingError,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Crypto from "effect/Crypto";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { makeWorkTrackingMutations } from "./WorkTrackingMutations.ts";
import { makeWorkTrackingDiscovery } from "./WorkTrackingDiscovery.ts";
import { makeWorkTrackingBackup } from "./WorkTrackingBackup.ts";
import { makeWorkTrackingReporting } from "./WorkTrackingReporting.ts";

export interface AutomaticWorkRecordInput {
  readonly kind: "agent-turn" | "agent-task";
  readonly projectId: string;
  readonly threadId: string;
  readonly turnId: string | null;
  readonly sourceEventId: string;
  readonly occurredAt: string;
  readonly provider: string;
  readonly outcome: "succeeded" | "failed" | "interrupted";
  readonly coverage: "complete" | "partial" | "unavailable";
  readonly inputTokens: number | null;
  readonly cachedInputTokens: number | null;
  readonly outputTokens: number | null;
  readonly reasoningTokens: number | null;
  readonly elapsedMs: number | null;
  readonly taskMs: number | null;
  readonly model: string | null;
  readonly effort: string | null;
  readonly toolUses: number | null;
}

type WorkError = WorkTrackingError;
export interface WorkTrackingServiceShape {
  readonly overview: (input: WorkOverviewInput) => Effect.Effect<WorkOverview, WorkError>;
  readonly manualRecords: (
    input: WorkOverviewInput,
  ) => Effect.Effect<ReadonlyArray<WorkRecord>, WorkError>;
  readonly upsertProfile: (input: WorkProfileInput) => Effect.Effect<WorkProfile, WorkError>;
  readonly upsertProject: (
    input: WorkProjectInput,
  ) => Effect.Effect<WorkTrackingProject, WorkError>;
  readonly upsertRepository: (
    input: WorkRepositoryInput,
  ) => Effect.Effect<WorkRepository, WorkError>;
  readonly discoverRepositories: (
    input: WorkRepositoryDiscoveryInput,
  ) => Effect.Effect<WorkRepositoryDiscovery, WorkError>;
  readonly upsertManualEntry: (
    input: WorkManualEntryInput,
  ) => Effect.Effect<WorkRecordValue, WorkError>;
  readonly recordAutomatic: (input: AutomaticWorkRecordInput) => Effect.Effect<void, WorkError>;
  readonly markDelivery: (
    trackingProjectId: string,
    threadId: string | null,
  ) => Effect.Effect<WorkDelivery, WorkError>;
  readonly reopenDelivery: (id: string) => Effect.Effect<WorkDelivery, WorkError>;
  readonly createReport: (input: WorkReportInput) => Effect.Effect<WorkReport, WorkError>;
  readonly transitionReport: (
    input: WorkReportTransitionInput,
  ) => Effect.Effect<WorkReport, WorkError>;
  readonly exportJson: Effect.Effect<WorkExport, WorkError>;
  readonly importJson: (input: WorkImportInput) => Effect.Effect<WorkExport, WorkError>;
  readonly exportCsv: (
    trackingProjectId: string,
    month: string,
  ) => Effect.Effect<{ filename: string; content: string }, WorkError>;
  readonly exportReportCsv: (
    input: WorkReportCsvInput,
  ) => Effect.Effect<{ filename: string; content: string }, WorkError>;
  readonly getReportSnapshot: (
    input: WorkReportSnapshotInput,
  ) => Effect.Effect<WorkReportSnapshot, WorkError>;
}

export class WorkTrackingService extends Context.Service<
  WorkTrackingService,
  WorkTrackingServiceShape
>()("t3/workTracking/WorkTrackingService") {}

const failure = (message: string) => new WorkTrackingError({ message });
const mapSqlError = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  effect.pipe(
    Effect.catchCause(() => Effect.fail(failure("Could not update the local work ledger."))),
  );
const decodeWorkRecord = Schema.decodeUnknownEffect(WorkRecord);

export const layer = Layer.effect(
  WorkTrackingService,
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const crypto = yield* Crypto.Crypto;
    const readProfile = mapSqlError(
      sql<
        Omit<WorkProfile, "trackingEnabled"> & { readonly trackingEnabled: number }
      >`SELECT id, display_name AS "displayName", time_zone AS "timeZone", tracking_enabled AS "trackingEnabled", created_at AS "createdAt", updated_at AS "updatedAt" FROM work_profiles LIMIT 1`,
    ).pipe(
      Effect.map((rows) => {
        const profile = rows[0];
        return profile
          ? ({ ...profile, trackingEnabled: profile.trackingEnabled === 1 } as WorkProfile)
          : null;
      }),
    );
    const readRepositories = (trackingProjectId?: string) =>
      mapSqlError(
        sql<WorkRepository>`SELECT id, tracking_project_id AS "trackingProjectId", local_root AS "localRoot", canonical_identity AS "canonicalIdentity", inclusion, provenance, created_at AS "createdAt", updated_at AS "updatedAt" FROM work_repositories ${trackingProjectId === undefined ? sql`` : sql`WHERE tracking_project_id = ${trackingProjectId}`}`,
      );
    const readProjects = Effect.fn("WorkTrackingService.readProjects")(function* () {
      const rows = yield* mapSqlError(
        sql<{
          readonly id: string;
          readonly name: string;
          readonly trackingEnabled: number;
          readonly createdAt: string;
          readonly updatedAt: string;
        }>`SELECT id, name, tracking_enabled AS "trackingEnabled", created_at AS "createdAt", updated_at AS "updatedAt" FROM work_tracking_projects ORDER BY name`,
      );
      return yield* Effect.forEach(rows, (row) =>
        Effect.gen(function* () {
          const bindings = yield* mapSqlError(
            sql<{
              readonly projectId: string;
            }>`SELECT project_id AS "projectId" FROM work_tracking_project_bindings WHERE tracking_project_id = ${row.id}`,
          );
          return {
            ...row,
            trackingEnabled: row.trackingEnabled === 1,
            t3ProjectIds: bindings.map((binding) => binding.projectId),
            repositories: yield* readRepositories(row.id),
          } as unknown as WorkTrackingProject;
        }),
      );
    });
    const decodeRecords = (rows: ReadonlyArray<Record<string, unknown>>) =>
      Effect.forEach(rows, (row) =>
        decodeWorkRecord({
          ...row,
          crossRepository: row.crossRepository === true || row.crossRepository === 1,
          tokens: JSON.parse(String(row.tokens)),
          toolUsage: row.toolUsage === null ? null : JSON.parse(String(row.toolUsage)),
        }),
      ).pipe(Effect.mapError(() => failure("Could not read the local work ledger.")));
    const readRecords = (input: WorkOverviewInput, limited = true) =>
      mapSqlError(
        sql<
          Record<string, unknown>
        >`SELECT id, kind, tracking_project_id AS "trackingProjectId", project_id AS "projectId", thread_id AS "threadId", turn_id AS "turnId", repository_id AS "repositoryId", cross_repository = 1 AS "crossRepository", occurred_at AS "occurredAt", duration_ms AS "durationMs", elapsed_ms AS "elapsedMs", active_ms AS "activeMs", waiting_ms AS "waitingMs", task_ms AS "taskMs", provider, model, effort, surface, json_object('inputTokens', input_tokens, 'cachedInputTokens', cached_input_tokens, 'outputTokens', output_tokens, 'reasoningTokens', reasoning_tokens) AS tokens, tool_usage_json AS "toolUsage", outcome, coverage, category, note, source_event_id AS "sourceEventId", revision, supersedes_id AS "supersedesId", created_at AS "createdAt", updated_at AS "updatedAt" FROM work_records WHERE occurred_at >= ${input.since} AND occurred_at < ${input.until} AND supersedes_id IS NULL ${input.trackingProjectId === undefined ? sql`` : sql`AND tracking_project_id = ${input.trackingProjectId}`} ORDER BY occurred_at DESC ${limited ? sql`LIMIT 500` : sql``}`,
      ).pipe(Effect.flatMap(decodeRecords));
    const manualRecords = (input: WorkOverviewInput) =>
      mapSqlError(
        sql<
          Record<string, unknown>
        >`SELECT id, kind, tracking_project_id AS "trackingProjectId", project_id AS "projectId", thread_id AS "threadId", turn_id AS "turnId", repository_id AS "repositoryId", cross_repository = 1 AS "crossRepository", occurred_at AS "occurredAt", duration_ms AS "durationMs", elapsed_ms AS "elapsedMs", active_ms AS "activeMs", waiting_ms AS "waitingMs", task_ms AS "taskMs", provider, model, effort, surface, json_object('inputTokens', input_tokens, 'cachedInputTokens', cached_input_tokens, 'outputTokens', output_tokens, 'reasoningTokens', reasoning_tokens) AS tokens, tool_usage_json AS "toolUsage", outcome, coverage, category, note, source_event_id AS "sourceEventId", revision, supersedes_id AS "supersedesId", created_at AS "createdAt", updated_at AS "updatedAt" FROM work_records WHERE kind = 'manual' AND occurred_at >= ${input.since} AND occurred_at < ${input.until} AND supersedes_id IS NULL ${input.trackingProjectId === undefined ? sql`` : sql`AND tracking_project_id = ${input.trackingProjectId}`} ORDER BY occurred_at DESC`,
      ).pipe(Effect.flatMap(decodeRecords));
    const readAdjustments = (input: WorkOverviewInput) =>
      mapSqlError(
        sql<
          Record<string, unknown>
        >`SELECT id, kind, tracking_project_id AS "trackingProjectId", project_id AS "projectId", thread_id AS "threadId", turn_id AS "turnId", repository_id AS "repositoryId", cross_repository = 1 AS "crossRepository", occurred_at AS "occurredAt", duration_ms AS "durationMs", elapsed_ms AS "elapsedMs", active_ms AS "activeMs", waiting_ms AS "waitingMs", task_ms AS "taskMs", provider, model, effort, surface, json_object('inputTokens', input_tokens, 'cachedInputTokens', cached_input_tokens, 'outputTokens', output_tokens, 'reasoningTokens', reasoning_tokens) AS tokens, tool_usage_json AS "toolUsage", outcome, coverage, category, note, source_event_id AS "sourceEventId", revision, supersedes_id AS "supersedesId", created_at AS "createdAt", updated_at AS "updatedAt" FROM work_records WHERE occurred_at >= ${input.since} AND occurred_at < ${input.until} AND supersedes_id IS NOT NULL ${input.trackingProjectId === undefined ? sql`` : sql`AND tracking_project_id = ${input.trackingProjectId}`} ORDER BY updated_at DESC LIMIT 100`,
      ).pipe(Effect.flatMap(decodeRecords));
    const readProjectTotals = (input: WorkOverviewInput) =>
      mapSqlError(
        sql<WorkProjectTotals>`SELECT tracking_project_id AS "trackingProjectId", json_object('manualMs', COALESCE(SUM(CASE WHEN kind = 'manual' THEN duration_ms ELSE 0 END), 0), 'agentElapsedMs', COALESCE(SUM(CASE WHEN kind = 'agent-turn' THEN elapsed_ms ELSE 0 END), 0), 'agentActiveMs', COALESCE(SUM(CASE WHEN kind = 'agent-turn' THEN active_ms ELSE 0 END), 0), 'agentWaitingMs', COALESCE(SUM(CASE WHEN kind = 'agent-turn' THEN waiting_ms ELSE 0 END), 0), 'agentTaskMs', COALESCE(SUM(CASE WHEN kind = 'agent-task' THEN task_ms ELSE 0 END), 0), 'inputTokens', COALESCE(SUM(input_tokens), 0), 'cachedInputTokens', COALESCE(SUM(cached_input_tokens), 0), 'outputTokens', COALESCE(SUM(output_tokens), 0), 'reasoningTokens', COALESCE(SUM(reasoning_tokens), 0), 'toolUses', COALESCE(SUM(COALESCE((SELECT SUM(value) FROM json_each(tool_usage_json)), 0)), 0), 'records', COUNT(*)) AS totals FROM work_records WHERE occurred_at >= ${input.since} AND occurred_at < ${input.until} AND supersedes_id IS NULL ${input.trackingProjectId === undefined ? sql`` : sql`AND tracking_project_id = ${input.trackingProjectId}`} GROUP BY tracking_project_id`,
      ).pipe(
        Effect.map((rows) =>
          rows.map(
            (row) => ({ ...row, totals: JSON.parse(String(row.totals)) }) as WorkProjectTotals,
          ),
        ),
      );
    const readRepositoryInvolvement = (input: WorkOverviewInput) =>
      mapSqlError(
        sql<WorkRepositoryInvolvement>`SELECT tracking_project_id AS "trackingProjectId", repository_id AS "repositoryId", COUNT(*) AS records FROM work_records WHERE occurred_at >= ${input.since} AND occurred_at < ${input.until} AND supersedes_id IS NULL AND repository_id IS NOT NULL ${input.trackingProjectId === undefined ? sql`` : sql`AND tracking_project_id = ${input.trackingProjectId}`} GROUP BY tracking_project_id, repository_id`,
      );
    const readTimeCoverage = (input: WorkOverviewInput) =>
      mapSqlError(
        sql<{
          readonly turns: number;
          readonly activeAvailable: number;
          readonly waitingAvailable: number;
        }>`SELECT COUNT(*) AS turns, COALESCE(SUM(CASE WHEN active_ms IS NOT NULL THEN 1 ELSE 0 END), 0) AS "activeAvailable", COALESCE(SUM(CASE WHEN waiting_ms IS NOT NULL THEN 1 ELSE 0 END), 0) AS "waitingAvailable" FROM work_records WHERE kind = 'agent-turn' AND occurred_at >= ${input.since} AND occurred_at < ${input.until} AND supersedes_id IS NULL ${input.trackingProjectId === undefined ? sql`` : sql`AND tracking_project_id = ${input.trackingProjectId}`}`,
      ).pipe(
        Effect.map((rows) => {
          const value = rows[0] ?? { turns: 0, activeAvailable: 0, waitingAvailable: 0 };
          const coverage = (available: number) =>
            value.turns === 0 || available === 0
              ? "unavailable"
              : available === value.turns
                ? "complete"
                : "partial";
          return {
            active: coverage(value.activeAvailable),
            waiting: coverage(value.waitingAvailable),
          } as const;
        }),
      );
    const readDeliveries = mapSqlError(
      sql<WorkDelivery>`SELECT id, tracking_project_id AS "trackingProjectId", thread_id AS "threadId", status, delivered_at AS "deliveredAt", reopened_at AS "reopenedAt", created_at AS "createdAt", updated_at AS "updatedAt" FROM work_deliveries ORDER BY updated_at DESC LIMIT 100`,
    );
    const readReports = Effect.fn("WorkTrackingService.readReports")(function* () {
      const rows = yield* mapSqlError(
        sql<
          Omit<WorkReport, "recordIds">
        >`SELECT id, tracking_project_id AS "trackingProjectId", month, status, generated_at AS "generatedAt", status_at AS "statusAt", revision, reference, project_name_snapshot AS "projectNameSnapshot", profile_display_name_snapshot AS "profileDisplayNameSnapshot" FROM work_reports ORDER BY generated_at DESC LIMIT 100`,
      );
      return yield* Effect.forEach(rows, (row) =>
        mapSqlError(
          sql<{
            readonly recordId: string;
          }>`SELECT record_id AS "recordId" FROM work_report_records WHERE report_id = ${row.id}`,
        ).pipe(
          Effect.map(
            (members) =>
              ({
                ...row,
                recordIds: members.map((member) => member.recordId),
              }) as unknown as WorkReport,
          ),
        ),
      );
    });
    const mutations = makeWorkTrackingMutations({ sql, crypto, readProfile, readRepositories });
    const discovery = makeWorkTrackingDiscovery(sql);
    const overview = Effect.fn("WorkTrackingService.overview")(function* (
      input: WorkOverviewInput,
    ) {
      yield* mutations.reconcileUnboundProjects();
      const [
        profile,
        projects,
        records,
        adjustments,
        projectTotals,
        repositoryInvolvement,
        deliveries,
        reports,
        timeCoverage,
      ] = yield* Effect.all([
        readProfile,
        readProjects(),
        readRecords(input),
        readAdjustments(input),
        readProjectTotals(input),
        readRepositoryInvolvement(input),
        readDeliveries,
        readReports(),
        readTimeCoverage(input),
      ]);
      const totals = projectTotals.reduce(
        (total, project) => ({
          manualMs: total.manualMs + project.totals.manualMs,
          agentElapsedMs: total.agentElapsedMs + project.totals.agentElapsedMs,
          agentActiveMs: total.agentActiveMs + project.totals.agentActiveMs,
          agentWaitingMs: total.agentWaitingMs + project.totals.agentWaitingMs,
          agentTaskMs: total.agentTaskMs + project.totals.agentTaskMs,
          inputTokens: total.inputTokens + project.totals.inputTokens,
          cachedInputTokens: total.cachedInputTokens + project.totals.cachedInputTokens,
          outputTokens: total.outputTokens + project.totals.outputTokens,
          reasoningTokens: total.reasoningTokens + project.totals.reasoningTokens,
          toolUses: total.toolUses + project.totals.toolUses,
          records: total.records + project.totals.records,
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
      return {
        profile,
        totals,
        timeCoverage,
        projects,
        records,
        adjustments,
        projectTotals,
        repositoryInvolvement,
        deliveries,
        reports,
      };
    });
    const reporting = makeWorkTrackingReporting({
      sql,
      crypto,
      readProfile,
      readRecords: (input) => readRecords(input, false),
    });
    const backup = makeWorkTrackingBackup(sql);
    return WorkTrackingService.of({
      overview,
      manualRecords,
      ...mutations,
      ...discovery,
      ...reporting,
      ...backup,
    } as unknown as WorkTrackingServiceShape);
  }),
);
