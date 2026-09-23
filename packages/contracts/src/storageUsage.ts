import * as Schema from "effect/Schema";
import { IsoDateTime, NonNegativeInt, ThreadId } from "./baseSchemas.ts";

export const StorageUsageInput = Schema.Struct({
  refresh: Schema.Boolean,
  search: Schema.String.check(Schema.isMaxLength(200)),
  offset: NonNegativeInt,
  limit: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 100 })),
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
});
export type StorageHistory = typeof StorageHistory.Type;

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
});
export type StorageUsageResult = typeof StorageUsageResult.Type;

export class StorageUsageError extends Schema.TaggedError<StorageUsageError>()(
  "StorageUsageError",
  { detail: Schema.String },
) {
  override get message(): string {
    return this.detail;
  }
}
