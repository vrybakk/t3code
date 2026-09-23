import * as Schema from "effect/Schema";
import { IsoDateTime, NonNegativeInt, ThreadId } from "./baseSchemas.ts";

export const StorageUsageInput = Schema.Struct({
  refresh: Schema.Boolean,
  search: Schema.String.check(Schema.isMaxLength(200)),
  offset: NonNegativeInt,
  limit: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 100 })),
  view: Schema.optionalKey(Schema.Literals(["histories", "groups", "directory"])),
  groupId: Schema.optionalKey(Schema.String),
  directoryId: Schema.optionalKey(Schema.String),
  snapshotId: Schema.optionalKey(Schema.String),
});
export type StorageUsageInput = typeof StorageUsageInput.Type;

export const StorageUsageTotals = Schema.Struct({
  logicalBytes: NonNegativeInt,
  allocatedBytes: Schema.NullOr(NonNegativeInt),
  fileCount: NonNegativeInt,
});
export type StorageUsageTotals = typeof StorageUsageTotals.Type;

export const StorageUsageCategory = Schema.Struct({
  id: Schema.String,
  label: Schema.String,
  rootPath: Schema.String,
  ...StorageUsageTotals.fields,
});
export type StorageUsageCategory = typeof StorageUsageCategory.Type;

export const StorageThreadLink = Schema.Struct({
  threadId: ThreadId,
  title: Schema.String,
  projectName: Schema.String,
  status: Schema.Literals(["linked", "active", "archived", "deleted"]),
});
export type StorageThreadLink = typeof StorageThreadLink.Type;

export const StorageHistory = Schema.Struct({
  filePath: Schema.String,
  provider: Schema.Literals(["codex", "claudeAgent"]),
  logicalBytes: NonNegativeInt,
  allocatedBytes: Schema.NullOr(NonNegativeInt),
  modifiedAt: IsoDateTime,
  archived: Schema.Boolean,
  threads: Schema.Array(StorageThreadLink),
  groupId: Schema.optionalKey(Schema.String),
  relationship: Schema.optionalKey(Schema.Literals(["direct", "subagent", "unlinked"])),
});
export type StorageHistory = typeof StorageHistory.Type;

export const StorageHistoryGroup = Schema.Struct({
  id: Schema.String,
  label: Schema.String,
  threads: Schema.Array(StorageThreadLink),
  ...StorageUsageTotals.fields,
  subagentCount: NonNegativeInt,
  parentMissing: Schema.Boolean,
});
export type StorageHistoryGroup = typeof StorageHistoryGroup.Type;

export const StorageDirectoryEntry = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  path: Schema.String,
  kind: Schema.Literals(["directory", "file", "symlink", "unmeasured"]),
  status: Schema.Literals(["measured", "skipped", "shared", "partial"]),
  ...StorageUsageTotals.fields,
});
export type StorageDirectoryEntry = typeof StorageDirectoryEntry.Type;

export const StorageDirectoryPage = Schema.Struct({
  current: Schema.NullOr(StorageDirectoryEntry),
  breadcrumbs: Schema.Array(StorageDirectoryEntry),
  entries: Schema.Array(StorageDirectoryEntry),
  totalEntries: NonNegativeInt,
});

export const StorageUsageResult = Schema.Struct({
  scannedAt: IsoDateTime,
  scanDurationMs: NonNegativeInt,
  totals: StorageUsageTotals,
  categories: Schema.Array(StorageUsageCategory),
  histories: Schema.Array(StorageHistory),
  totalHistories: NonNegativeInt,
  matchedHistories: NonNegativeInt,
  warnings: Schema.Array(Schema.String),
  truncated: Schema.Boolean,
  snapshotId: Schema.optionalKey(Schema.String),
  groups: Schema.optionalKey(Schema.Array(StorageHistoryGroup)),
  totalGroups: Schema.optionalKey(NonNegativeInt),
  matchedGroups: Schema.optionalKey(NonNegativeInt),
  directory: Schema.optionalKey(StorageDirectoryPage),
});
export type StorageUsageResult = typeof StorageUsageResult.Type;

export class StorageUsageError extends Schema.TaggedError<StorageUsageError>()(
  "StorageUsageError",
  {
    detail: Schema.String,
    reason: Schema.optionalKey(
      Schema.Literals(["stale-snapshot", "invalid-selection", "scan-failed"]),
    ),
  },
) {
  override get message(): string {
    return this.detail;
  }
}
