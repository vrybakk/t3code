import {
  type WorkDelivery,
  type WorkExport,
  type WorkImportInput,
  type WorkProfile,
  type WorkReport,
  type WorkRepository,
  type WorkTrackingProject,
  WorkImportInput as WorkImportInputSchema,
  WorkRecord as WorkRecordSchema,
  WorkTrackingError,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as SqlClient from "effect/unstable/sql/SqlClient";

const failure = (message: string) => new WorkTrackingError({ message });
const mapSqlError = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  effect.pipe(
    Effect.catchCause(() => Effect.fail(failure("Could not update the local work ledger."))),
  );
const decodeWorkRecord = Schema.decodeUnknownEffect(WorkRecordSchema);
const decodeImport = Schema.decodeUnknownEffect(WorkImportInputSchema);
const encodeToolUsage = Schema.encodeSync(
  Schema.fromJsonString(
    Schema.Record(Schema.String, Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))),
  ),
);

const duplicate = (values: ReadonlyArray<string>) => new Set(values).size !== values.length;
const canonical = (value: unknown) => JSON.stringify(value);
const projectComparable = (project: WorkTrackingProject) =>
  canonical({
    id: project.id,
    name: project.name,
    trackingEnabled: project.trackingEnabled,
    t3ProjectIds: [...project.t3ProjectIds].sort(),
    repositories: project.repositories
      .map((repository) => ({
        id: repository.id,
        trackingProjectId: repository.trackingProjectId,
        localRoot: repository.localRoot,
        canonicalIdentity: repository.canonicalIdentity,
        inclusion: repository.inclusion,
        provenance: repository.provenance,
      }))
      .sort((left, right) => left.id.localeCompare(right.id)),
  });
const reportComparable = (report: WorkReport) =>
  canonical({
    id: report.id,
    trackingProjectId: report.trackingProjectId,
    month: report.month,
    status: report.status,
    reference: report.reference,
    projectNameSnapshot: report.projectNameSnapshot,
    profileDisplayNameSnapshot: report.profileDisplayNameSnapshot,
    recordIds: [...report.recordIds].sort(),
  });
const validateBackup = (backup: WorkExport) => {
  const projectIds = new Set(backup.projects.map((project) => project.id));
  const boundT3ProjectIds = backup.projects.flatMap((project) => project.t3ProjectIds);
  const repositories = backup.projects.flatMap((project) => project.repositories);
  const repositoryIds = repositories.map((repository) => repository.id);
  const repositoryProjectIds = new Map(
    repositories.map((repository) => [repository.id, repository.trackingProjectId]),
  );
  const recordIds = backup.records.map((record) => record.id);
  const recordsById = new Map(backup.records.map((record) => [record.id, record]));
  if (duplicate(backup.projects.map((project) => project.id)))
    return "Backup has duplicate projects.";
  if (duplicate(boundT3ProjectIds)) return "Backup binds a T3 project more than once.";
  if (duplicate(repositoryIds)) return "Backup has duplicate repositories.";
  if (duplicate(recordIds)) return "Backup has duplicate records.";
  if (duplicate(backup.deliveries.map((delivery) => delivery.id)))
    return "Backup has duplicate deliveries.";
  if (duplicate(backup.reports.map((report) => report.id))) return "Backup has duplicate reports.";
  if (
    duplicate(
      backup.records.flatMap((record) =>
        record.sourceEventId === null ? [] : [record.sourceEventId],
      ),
    )
  )
    return "Backup has duplicate source events.";
  for (const project of backup.projects)
    for (const repository of project.repositories)
      if (repository.trackingProjectId !== project.id)
        return "Repository is bound to the wrong tracking project.";
  for (const record of backup.records) {
    if (!projectIds.has(record.trackingProjectId))
      return "Record references a missing tracking project.";
    if (record.repositoryId !== null && !repositoryProjectIds.has(record.repositoryId))
      return "Record references a missing repository.";
    if (
      record.repositoryId !== null &&
      repositoryProjectIds.get(record.repositoryId) !== record.trackingProjectId
    )
      return "Record repository belongs to another tracking project.";
    if (record.supersedesId !== null && !recordsById.has(record.supersedesId))
      return "Record references a missing superseding revision.";
    if (record.supersedesId === record.id) return "Record cannot supersede itself.";
    if (
      record.supersedesId !== null &&
      recordsById.get(record.supersedesId)?.trackingProjectId !== record.trackingProjectId
    )
      return "Record revision crosses tracking projects.";
  }
  for (const record of backup.records) {
    const visited = new Set<string>();
    let current = record;
    while (current.supersedesId !== null) {
      if (visited.has(current.id)) return "Record revisions contain a cycle.";
      visited.add(current.id);
      current = recordsById.get(current.supersedesId)!;
    }
  }
  for (const delivery of backup.deliveries)
    if (!projectIds.has(delivery.trackingProjectId))
      return "Delivery references a missing tracking project.";
  for (const report of backup.reports) {
    if (!projectIds.has(report.trackingProjectId))
      return "Report references a missing tracking project.";
    if (duplicate(report.recordIds)) return "Report has duplicate record membership.";
    if (report.recordIds.some((recordId) => !recordsById.has(recordId)))
      return "Report references a missing record.";
    if (
      report.recordIds.some(
        (recordId) => recordsById.get(recordId)?.trackingProjectId !== report.trackingProjectId,
      )
    )
      return "Report record belongs to another tracking project.";
  }
  return null;
};

const readRecordRows = (sql: SqlClient.SqlClient) =>
  mapSqlError(
    sql<
      Record<string, unknown>
    >`SELECT id, kind, tracking_project_id AS "trackingProjectId", project_id AS "projectId", thread_id AS "threadId", turn_id AS "turnId", repository_id AS "repositoryId", cross_repository = 1 AS "crossRepository", occurred_at AS "occurredAt", duration_ms AS "durationMs", elapsed_ms AS "elapsedMs", active_ms AS "activeMs", waiting_ms AS "waitingMs", task_ms AS "taskMs", provider, model, effort, surface, json_object('inputTokens', input_tokens, 'cachedInputTokens', cached_input_tokens, 'outputTokens', output_tokens, 'reasoningTokens', reasoning_tokens) AS tokens, tool_usage_json AS "toolUsage", outcome, coverage, category, note, source_event_id AS "sourceEventId", revision, supersedes_id AS "supersedesId", created_at AS "createdAt", updated_at AS "updatedAt" FROM work_records ORDER BY occurred_at DESC`,
  ).pipe(
    Effect.flatMap((rows) =>
      Effect.forEach(rows, (row) =>
        decodeWorkRecord({
          ...row,
          crossRepository: row.crossRepository === true || row.crossRepository === 1,
          tokens: JSON.parse(String(row.tokens)),
          toolUsage: row.toolUsage === null ? null : JSON.parse(String(row.toolUsage)),
        }),
      ),
    ),
    Effect.mapError(() => failure("Could not read the local work ledger.")),
  );

const validateLocalMerge = (existingLedger: WorkExport, backup: WorkExport) =>
  Effect.gen(function* () {
    if (
      existingLedger.profile &&
      backup.profile &&
      existingLedger.profile.id === backup.profile.id &&
      canonical(existingLedger.profile) !== canonical(backup.profile)
    )
      return yield* Effect.fail(failure("Backup profile conflicts with local history."));
    const localProjects = new Map(existingLedger.projects.map((project) => [project.id, project]));
    const localRecords = new Map(existingLedger.records.map((record) => [record.id, record]));
    const localDeliveries = new Map(
      existingLedger.deliveries.map((delivery) => [delivery.id, delivery]),
    );
    const localReports = new Map(existingLedger.reports.map((report) => [report.id, report]));
    for (const project of backup.projects) {
      const local = localProjects.get(project.id);
      if (local && projectComparable(local) !== projectComparable(project))
        return yield* Effect.fail(failure("Backup tracking project conflicts with local history."));
      for (const projectId of project.t3ProjectIds)
        if (
          existingLedger.projects.some(
            (candidate) =>
              candidate.id !== project.id && candidate.t3ProjectIds.includes(projectId),
          )
        )
          return yield* Effect.fail(failure("Backup T3 project is already bound locally."));
    }
    for (const record of backup.records) {
      const local = localRecords.get(record.id);
      if (local && canonical(local) !== canonical(record))
        return yield* Effect.fail(failure("Backup record conflicts with local history."));
    }
    for (const delivery of backup.deliveries) {
      const local = localDeliveries.get(delivery.id);
      if (local && canonical(local) !== canonical(delivery))
        return yield* Effect.fail(failure("Backup delivery conflicts with local history."));
    }
    for (const report of backup.reports) {
      const local = localReports.get(report.id);
      if (local && reportComparable(local) !== reportComparable(report))
        return yield* Effect.fail(failure("Backup report conflicts with local history."));
    }
  });

export const makeWorkTrackingBackup = (sql: SqlClient.SqlClient) => {
  const readExport = Effect.gen(function* () {
    const profileRow =
      (yield* mapSqlError(
        sql<WorkProfile>`SELECT id, display_name AS "displayName", time_zone AS "timeZone", tracking_enabled = 1 AS "trackingEnabled", created_at AS "createdAt", updated_at AS "updatedAt" FROM work_profiles LIMIT 1`,
      ))[0] ?? null;
    const profile =
      profileRow === null
        ? null
        : ({
            ...profileRow,
            trackingEnabled: Number(profileRow.trackingEnabled) === 1,
          } as WorkProfile);
    const projectRows = yield* mapSqlError(
      sql<{
        readonly id: string;
        readonly name: string;
        readonly trackingEnabled: boolean;
        readonly createdAt: string;
        readonly updatedAt: string;
      }>`SELECT id, name, tracking_enabled = 1 AS "trackingEnabled", created_at AS "createdAt", updated_at AS "updatedAt" FROM work_tracking_projects ORDER BY name`,
    );
    const projects = yield* Effect.forEach(projectRows, (project) =>
      Effect.gen(function* () {
        const bindings = yield* mapSqlError(
          sql<{
            readonly projectId: string;
          }>`SELECT project_id AS "projectId" FROM work_tracking_project_bindings WHERE tracking_project_id = ${project.id}`,
        );
        const repositories = yield* mapSqlError(
          sql<WorkRepository>`SELECT id, tracking_project_id AS "trackingProjectId", local_root AS "localRoot", canonical_identity AS "canonicalIdentity", inclusion, provenance, created_at AS "createdAt", updated_at AS "updatedAt" FROM work_repositories WHERE tracking_project_id = ${project.id}`,
        );
        return {
          ...project,
          trackingEnabled: Number(project.trackingEnabled) === 1,
          t3ProjectIds: bindings.map((binding) => binding.projectId),
          repositories,
        } as unknown as WorkTrackingProject;
      }),
    );
    const deliveries = yield* mapSqlError(
      sql<WorkDelivery>`SELECT id, tracking_project_id AS "trackingProjectId", thread_id AS "threadId", status, delivered_at AS "deliveredAt", reopened_at AS "reopenedAt", created_at AS "createdAt", updated_at AS "updatedAt" FROM work_deliveries ORDER BY updated_at DESC`,
    );
    const reportRows = yield* mapSqlError(
      sql<
        Omit<WorkReport, "recordIds">
      >`SELECT id, tracking_project_id AS "trackingProjectId", month, status, generated_at AS "generatedAt", status_at AS "statusAt", revision, reference, project_name_snapshot AS "projectNameSnapshot", profile_display_name_snapshot AS "profileDisplayNameSnapshot" FROM work_reports ORDER BY generated_at DESC`,
    );
    const reports = yield* Effect.forEach(reportRows, (report) =>
      mapSqlError(
        sql<{
          readonly recordId: string;
        }>`SELECT record_id AS "recordId" FROM work_report_records WHERE report_id = ${report.id}`,
      ).pipe(
        Effect.map(
          (members) =>
            ({
              ...report,
              recordIds: members.map((member) => member.recordId),
            }) as unknown as WorkReport,
        ),
      ),
    );
    return {
      version: 1 as const,
      profile,
      projects,
      records: yield* readRecordRows(sql),
      deliveries,
      reports,
    };
  });
  const exportJson = sql.withTransaction(readExport);
  const importJson = Effect.fn("WorkTrackingService.importJson")(function* (
    input: WorkImportInput,
  ) {
    const payload = yield* decodeImport(input).pipe(
      Effect.mapError(() => failure("Invalid work backup.")),
    );
    const graphError = validateBackup(payload.backup);
    if (graphError) return yield* Effect.fail(failure(graphError));
    yield* sql.withTransaction(
      Effect.gen(function* () {
        yield* validateLocalMerge(yield* readExport, payload.backup);
        const existingProfile = (yield* mapSqlError(
          sql<{ readonly id: string }>`SELECT id FROM work_profiles LIMIT 1`,
        ))[0];
        if (
          existingProfile &&
          payload.backup.profile &&
          existingProfile.id !== payload.backup.profile.id
        )
          return yield* Effect.fail(failure("Backup profile does not match this local ledger."));
        for (const record of payload.backup.records)
          if (record.sourceEventId !== null) {
            const existing = (yield* mapSqlError(
              sql<{
                readonly id: string;
              }>`SELECT id FROM work_records WHERE source_event_id = ${record.sourceEventId}`,
            ))[0];
            if (existing && existing.id !== record.id)
              return yield* Effect.fail(
                failure("Backup source event conflicts with local history."),
              );
          }
        if (payload.backup.profile)
          yield* mapSqlError(
            sql`INSERT INTO work_profiles(id, display_name, time_zone, tracking_enabled, created_at, updated_at) VALUES (${payload.backup.profile.id}, ${payload.backup.profile.displayName}, ${payload.backup.profile.timeZone}, ${payload.backup.profile.trackingEnabled ? 1 : 0}, ${payload.backup.profile.createdAt}, ${payload.backup.profile.updatedAt}) ON CONFLICT(id) DO NOTHING`,
          );
        for (const project of payload.backup.projects) {
          yield* mapSqlError(
            sql`INSERT INTO work_tracking_projects(id, name, tracking_enabled, created_at, updated_at) VALUES (${project.id}, ${project.name}, ${project.trackingEnabled ? 1 : 0}, ${project.createdAt}, ${project.updatedAt}) ON CONFLICT(id) DO NOTHING`,
          );
          yield* Effect.forEach(project.t3ProjectIds, (projectId) =>
            mapSqlError(
              sql`INSERT INTO work_tracking_project_bindings(tracking_project_id, project_id) VALUES (${project.id}, ${projectId}) ON CONFLICT DO NOTHING`,
            ),
          );
          yield* Effect.forEach(project.repositories, (repository) =>
            mapSqlError(
              sql`INSERT INTO work_repositories(id, tracking_project_id, local_root, canonical_identity, inclusion, provenance, created_at, updated_at) VALUES (${repository.id}, ${repository.trackingProjectId}, ${repository.localRoot}, ${repository.canonicalIdentity}, ${repository.inclusion}, ${repository.provenance}, ${repository.createdAt}, ${repository.updatedAt}) ON CONFLICT(id) DO NOTHING`,
            ),
          );
        }
        const newRecordIds = new Set<string>();
        for (const record of payload.backup.records) {
          const existing = (yield* mapSqlError(
            sql<{ readonly id: string }>`SELECT id FROM work_records WHERE id = ${record.id}`,
          ))[0];
          if (existing) continue;
          newRecordIds.add(record.id);
          yield* mapSqlError(
            sql`INSERT INTO work_records(id, kind, tracking_project_id, project_id, thread_id, turn_id, repository_id, cross_repository, occurred_at, duration_ms, elapsed_ms, active_ms, waiting_ms, task_ms, provider, model, effort, surface, input_tokens, cached_input_tokens, output_tokens, reasoning_tokens, tool_usage_json, outcome, coverage, category, note, source_event_id, revision, supersedes_id, created_at, updated_at) VALUES (${record.id}, ${record.kind}, ${record.trackingProjectId}, ${record.projectId}, ${record.threadId}, ${record.turnId}, ${record.repositoryId}, ${record.crossRepository ? 1 : 0}, ${record.occurredAt}, ${record.durationMs}, ${record.elapsedMs}, ${record.activeMs}, ${record.waitingMs}, ${record.taskMs}, ${record.provider}, ${record.model}, ${record.effort}, ${record.surface}, ${record.tokens.inputTokens}, ${record.tokens.cachedInputTokens}, ${record.tokens.outputTokens}, ${record.tokens.reasoningTokens}, ${record.toolUsage === null ? null : encodeToolUsage(record.toolUsage)}, ${record.outcome}, ${record.coverage}, ${record.category}, ${record.note}, ${record.sourceEventId}, ${record.revision}, NULL, ${record.createdAt}, ${record.updatedAt})`,
          );
        }
        for (const record of payload.backup.records)
          if (newRecordIds.has(record.id) && record.supersedesId !== null)
            yield* mapSqlError(
              sql`UPDATE work_records SET supersedes_id = ${record.supersedesId} WHERE id = ${record.id}`,
            );
        for (const delivery of payload.backup.deliveries)
          yield* mapSqlError(
            sql`INSERT INTO work_deliveries(id, tracking_project_id, thread_id, status, delivered_at, reopened_at, created_at, updated_at) VALUES (${delivery.id}, ${delivery.trackingProjectId}, ${delivery.threadId}, ${delivery.status}, ${delivery.deliveredAt}, ${delivery.reopenedAt}, ${delivery.createdAt}, ${delivery.updatedAt}) ON CONFLICT(id) DO NOTHING`,
          );
        for (const report of payload.backup.reports) {
          const existing = (yield* mapSqlError(
            sql<{ readonly id: string }>`SELECT id FROM work_reports WHERE id = ${report.id}`,
          ))[0];
          if (existing) continue;
          yield* mapSqlError(
            sql`INSERT INTO work_reports(id, tracking_project_id, month, status, generated_at, status_at, revision, reference, project_name_snapshot, profile_display_name_snapshot) VALUES (${report.id}, ${report.trackingProjectId}, ${report.month}, ${report.status}, ${report.generatedAt}, ${report.statusAt}, ${report.revision}, ${report.reference}, ${report.projectNameSnapshot}, ${report.profileDisplayNameSnapshot})`,
          );
          yield* Effect.forEach(report.recordIds, (recordId) =>
            mapSqlError(
              sql`INSERT INTO work_report_records(report_id, record_id) VALUES (${report.id}, ${recordId})`,
            ),
          );
        }
      }),
    );
    return yield* exportJson;
  });
  return { exportJson, importJson };
};
