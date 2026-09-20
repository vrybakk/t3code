/** Local, environment-owned work ledger. It intentionally contains no pricing or billing data. */
import * as Schema from "effect/Schema";

import {
  EventId,
  IsoDateTime,
  NonNegativeInt,
  ProjectId,
  ThreadId,
  TrimmedNonEmptyString,
  TurnId,
} from "./baseSchemas.ts";

const WorkId = <Brand extends string>(brand: Brand) =>
  TrimmedNonEmptyString.pipe(Schema.brand(brand));
export const WorkProfileId = WorkId("WorkProfileId");
export type WorkProfileId = typeof WorkProfileId.Type;
export const WorkTrackingProjectId = WorkId("WorkTrackingProjectId");
export type WorkTrackingProjectId = typeof WorkTrackingProjectId.Type;
export const WorkRepositoryId = WorkId("WorkRepositoryId");
export type WorkRepositoryId = typeof WorkRepositoryId.Type;
export const WorkRecordId = WorkId("WorkRecordId");
export type WorkRecordId = typeof WorkRecordId.Type;
export const WorkDeliveryId = WorkId("WorkDeliveryId");
export type WorkDeliveryId = typeof WorkDeliveryId.Type;
export const WorkReportId = WorkId("WorkReportId");
export type WorkReportId = typeof WorkReportId.Type;

export const WorkCoverage = Schema.Literals(["complete", "partial", "unavailable"]);
export type WorkCoverage = typeof WorkCoverage.Type;
export const WorkRecordKind = Schema.Literals(["manual", "agent-turn", "agent-task"]);
export type WorkRecordKind = typeof WorkRecordKind.Type;
export const WorkOutcome = Schema.Literals([
  "succeeded",
  "failed",
  "interrupted",
  "retried",
  "discarded",
  "unknown",
]);
export type WorkOutcome = typeof WorkOutcome.Type;
export const WorkReportStatus = Schema.Literals(["open", "submitted", "invoiced"]);
export type WorkReportStatus = typeof WorkReportStatus.Type;

export const WorkProfile = Schema.Struct({
  id: WorkProfileId,
  displayName: TrimmedNonEmptyString,
  timeZone: TrimmedNonEmptyString,
  trackingEnabled: Schema.Boolean,
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type WorkProfile = typeof WorkProfile.Type;

export const WorkRepository = Schema.Struct({
  id: WorkRepositoryId,
  trackingProjectId: WorkTrackingProjectId,
  localRoot: TrimmedNonEmptyString,
  canonicalIdentity: Schema.NullOr(TrimmedNonEmptyString),
  inclusion: Schema.Literals(["included", "excluded"]),
  provenance: Schema.Literals(["discovered", "manual"]),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type WorkRepository = typeof WorkRepository.Type;
export const WorkRepositoryCandidate = Schema.Struct({
  localRoot: TrimmedNonEmptyString,
  canonicalIdentity: Schema.NullOr(TrimmedNonEmptyString),
  inclusion: Schema.NullOr(Schema.Literals(["included", "excluded"])),
  provenance: Schema.NullOr(Schema.Literals(["discovered", "manual"])),
  sourceProjectId: ProjectId,
});
export type WorkRepositoryCandidate = typeof WorkRepositoryCandidate.Type;
export const WorkRepositoryDiscoveryInput = Schema.Struct({
  trackingProjectId: WorkTrackingProjectId,
});
export type WorkRepositoryDiscoveryInput = typeof WorkRepositoryDiscoveryInput.Type;
export const WorkRepositoryDiscovery = Schema.Struct({
  candidates: Schema.Array(WorkRepositoryCandidate),
  truncated: Schema.Boolean,
});
export type WorkRepositoryDiscovery = typeof WorkRepositoryDiscovery.Type;

export const WorkTrackingProject = Schema.Struct({
  id: WorkTrackingProjectId,
  name: TrimmedNonEmptyString,
  t3ProjectIds: Schema.Array(ProjectId),
  trackingEnabled: Schema.Boolean,
  repositories: Schema.Array(WorkRepository),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type WorkTrackingProject = typeof WorkTrackingProject.Type;

export const WorkTokens = Schema.Struct({
  inputTokens: Schema.NullOr(NonNegativeInt),
  cachedInputTokens: Schema.NullOr(NonNegativeInt),
  outputTokens: Schema.NullOr(NonNegativeInt),
  reasoningTokens: Schema.NullOr(NonNegativeInt),
});
export type WorkTokens = typeof WorkTokens.Type;

export const WorkRecord = Schema.Struct({
  id: WorkRecordId,
  kind: WorkRecordKind,
  trackingProjectId: WorkTrackingProjectId,
  projectId: Schema.NullOr(ProjectId),
  threadId: Schema.NullOr(ThreadId),
  turnId: Schema.NullOr(TurnId),
  repositoryId: Schema.NullOr(WorkRepositoryId),
  crossRepository: Schema.Boolean,
  occurredAt: IsoDateTime,
  durationMs: Schema.NullOr(NonNegativeInt),
  elapsedMs: Schema.NullOr(NonNegativeInt),
  activeMs: Schema.NullOr(NonNegativeInt),
  waitingMs: Schema.NullOr(NonNegativeInt),
  taskMs: Schema.NullOr(NonNegativeInt),
  provider: Schema.NullOr(TrimmedNonEmptyString),
  model: Schema.NullOr(TrimmedNonEmptyString),
  effort: Schema.NullOr(TrimmedNonEmptyString),
  surface: Schema.NullOr(TrimmedNonEmptyString),
  tokens: WorkTokens,
  toolUsage: Schema.NullOr(Schema.Record(TrimmedNonEmptyString, NonNegativeInt)),
  outcome: WorkOutcome,
  coverage: WorkCoverage,
  category: Schema.NullOr(TrimmedNonEmptyString),
  note: Schema.NullOr(TrimmedNonEmptyString),
  sourceEventId: Schema.NullOr(EventId),
  revision: NonNegativeInt,
  supersedesId: Schema.NullOr(WorkRecordId),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type WorkRecord = typeof WorkRecord.Type;

export const WorkManualEntryInput = Schema.Struct({
  id: Schema.optional(WorkRecordId),
  trackingProjectId: WorkTrackingProjectId,
  threadId: Schema.optional(ThreadId),
  repositoryId: Schema.optional(WorkRepositoryId),
  crossRepository: Schema.optional(Schema.Boolean),
  occurredAt: IsoDateTime,
  durationMs: NonNegativeInt,
  category: Schema.optional(TrimmedNonEmptyString),
  note: Schema.optional(TrimmedNonEmptyString),
});
export type WorkManualEntryInput = typeof WorkManualEntryInput.Type;

export const WorkDelivery = Schema.Struct({
  id: WorkDeliveryId,
  trackingProjectId: WorkTrackingProjectId,
  threadId: Schema.NullOr(ThreadId),
  status: Schema.Literals(["open", "delivered"]),
  deliveredAt: Schema.NullOr(IsoDateTime),
  reopenedAt: Schema.NullOr(IsoDateTime),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type WorkDelivery = typeof WorkDelivery.Type;

export const WorkReport = Schema.Struct({
  id: WorkReportId,
  trackingProjectId: WorkTrackingProjectId,
  month: TrimmedNonEmptyString,
  status: WorkReportStatus,
  recordIds: Schema.Array(WorkRecordId),
  generatedAt: IsoDateTime,
  statusAt: IsoDateTime,
  revision: NonNegativeInt,
  reference: Schema.NullOr(TrimmedNonEmptyString),
  projectNameSnapshot: Schema.NullOr(TrimmedNonEmptyString),
  profileDisplayNameSnapshot: Schema.NullOr(TrimmedNonEmptyString),
});
export type WorkReport = typeof WorkReport.Type;

export const WorkOverviewInput = Schema.Struct({
  since: IsoDateTime,
  until: IsoDateTime,
  trackingProjectId: Schema.optional(WorkTrackingProjectId),
});
export type WorkOverviewInput = typeof WorkOverviewInput.Type;
export const WorkTotals = Schema.Struct({
  manualMs: NonNegativeInt,
  agentElapsedMs: NonNegativeInt,
  agentActiveMs: NonNegativeInt,
  agentWaitingMs: NonNegativeInt,
  agentTaskMs: NonNegativeInt,
  records: NonNegativeInt,
});
export type WorkTotals = typeof WorkTotals.Type;
export const WorkReportSnapshot = Schema.Struct({
  report: WorkReport,
  projectName: TrimmedNonEmptyString,
  profileDisplayName: Schema.NullOr(TrimmedNonEmptyString),
  profile: Schema.NullOr(WorkProfile),
  records: Schema.Array(WorkRecord),
  totals: WorkTotals,
});
export type WorkReportSnapshot = typeof WorkReportSnapshot.Type;
export const WorkProjectTotals = Schema.Struct({
  trackingProjectId: WorkTrackingProjectId,
  totals: WorkTotals,
});
export type WorkProjectTotals = typeof WorkProjectTotals.Type;
export const WorkTimeCoverage = Schema.Struct({
  active: WorkCoverage,
  waiting: WorkCoverage,
});
export type WorkTimeCoverage = typeof WorkTimeCoverage.Type;
export const WorkRepositoryInvolvement = Schema.Struct({
  trackingProjectId: WorkTrackingProjectId,
  repositoryId: WorkRepositoryId,
  records: NonNegativeInt,
});
export type WorkRepositoryInvolvement = typeof WorkRepositoryInvolvement.Type;
export const WorkOverview = Schema.Struct({
  profile: Schema.NullOr(WorkProfile),
  totals: WorkTotals,
  timeCoverage: WorkTimeCoverage,
  projects: Schema.Array(WorkTrackingProject),
  records: Schema.Array(WorkRecord),
  adjustments: Schema.Array(WorkRecord),
  projectTotals: Schema.Array(WorkProjectTotals),
  repositoryInvolvement: Schema.Array(WorkRepositoryInvolvement),
  deliveries: Schema.Array(WorkDelivery),
  reports: Schema.Array(WorkReport),
});
export type WorkOverview = typeof WorkOverview.Type;

export const WorkProfileInput = Schema.Struct({
  displayName: TrimmedNonEmptyString,
  timeZone: TrimmedNonEmptyString,
  trackingEnabled: Schema.Boolean,
});
export type WorkProfileInput = typeof WorkProfileInput.Type;
export const WorkProjectInput = Schema.Struct({
  id: Schema.optional(WorkTrackingProjectId),
  name: TrimmedNonEmptyString,
  t3ProjectIds: Schema.Array(ProjectId),
  trackingEnabled: Schema.Boolean,
});
export type WorkProjectInput = typeof WorkProjectInput.Type;
export const WorkRepositoryInput = Schema.Struct({
  id: Schema.optional(WorkRepositoryId),
  trackingProjectId: WorkTrackingProjectId,
  localRoot: TrimmedNonEmptyString,
  canonicalIdentity: Schema.optional(TrimmedNonEmptyString),
  inclusion: Schema.Literals(["included", "excluded"]),
  provenance: Schema.Literals(["discovered", "manual"]),
});
export type WorkRepositoryInput = typeof WorkRepositoryInput.Type;
export const WorkReportInput = Schema.Struct({
  trackingProjectId: WorkTrackingProjectId,
  month: TrimmedNonEmptyString,
  reference: Schema.optional(TrimmedNonEmptyString),
});
export type WorkReportInput = typeof WorkReportInput.Type;
export const WorkReportTransitionInput = Schema.Struct({
  id: WorkReportId,
  status: WorkReportStatus,
  reference: Schema.optional(TrimmedNonEmptyString),
});
export type WorkReportTransitionInput = typeof WorkReportTransitionInput.Type;
export const WorkReportCsvInput = Schema.Struct({ id: WorkReportId });
export type WorkReportCsvInput = typeof WorkReportCsvInput.Type;
export const WorkReportSnapshotInput = Schema.Struct({ id: WorkReportId });
export type WorkReportSnapshotInput = typeof WorkReportSnapshotInput.Type;
export const WorkExport = Schema.Struct({
  version: Schema.Literal(1),
  profile: Schema.NullOr(WorkProfile),
  projects: Schema.Array(WorkTrackingProject),
  records: Schema.Array(WorkRecord),
  deliveries: Schema.Array(WorkDelivery),
  reports: Schema.Array(WorkReport),
});
export type WorkExport = typeof WorkExport.Type;
/** Merge is intentionally the only v1 import mode: backups never overwrite local history. */
export const WorkImportMode = Schema.Literal("merge");
export type WorkImportMode = typeof WorkImportMode.Type;
export const WorkImportInput = Schema.Struct({
  mode: WorkImportMode,
  backup: WorkExport,
});
export type WorkImportInput = typeof WorkImportInput.Type;
export const WorkCsvExport = Schema.Struct({
  filename: TrimmedNonEmptyString,
  content: Schema.String,
});
export type WorkCsvExport = typeof WorkCsvExport.Type;

export class WorkTrackingError extends Schema.TaggedError<WorkTrackingError>()(
  "WorkTrackingError",
  { message: TrimmedNonEmptyString },
) {}
