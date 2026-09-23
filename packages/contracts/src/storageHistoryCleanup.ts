import * as Schema from "effect/Schema";
import { IsoDateTime, NonNegativeInt } from "./baseSchemas.ts";
import { StorageUsageTotals } from "./storageUsage.ts";

export const StorageCleanupReviewInput = Schema.Struct({
  snapshotId: Schema.String,
  historyIds: Schema.Array(Schema.String).check(Schema.isMaxLength(1000)),
  groupIds: Schema.Array(Schema.String).check(Schema.isMaxLength(1000)),
});
export type StorageCleanupReviewInput = typeof StorageCleanupReviewInput.Type;
export const StorageCleanupReviewItem = Schema.Struct({
  id: Schema.String,
  filePath: Schema.String,
  logicalBytes: NonNegativeInt,
  allocatedBytes: Schema.NullOr(NonNegativeInt),
  eligible: Schema.Boolean,
  reason: Schema.NullOr(Schema.String),
});
export const StorageCleanupReviewResult = Schema.Struct({
  planId: Schema.String,
  expiresAt: IsoDateTime,
  trashSupported: Schema.Boolean,
  items: Schema.Array(StorageCleanupReviewItem),
  totals: StorageUsageTotals,
  eligibleCount: NonNegativeInt,
  blockedCount: NonNegativeInt,
  warnings: Schema.Array(Schema.String),
});
export type StorageCleanupReviewResult = typeof StorageCleanupReviewResult.Type;
export const StorageCleanupExecuteInput = Schema.Struct({
  planId: Schema.String,
  mode: Schema.Literals(["trash", "delete"]),
  acknowledgeExternalSessionsStopped: Schema.Boolean,
  acknowledgeHistoryLoss: Schema.Boolean,
  confirmPermanentDelete: Schema.Boolean,
});
export type StorageCleanupExecuteInput = typeof StorageCleanupExecuteInput.Type;
export const StorageCleanupExecuteItem = Schema.Struct({
  id: Schema.String,
  filePath: Schema.String,
  status: Schema.Literals(["trashed", "deleted", "blocked", "failed"]),
  reason: Schema.NullOr(Schema.String),
});
export const StorageCleanupExecuteResult = Schema.Struct({
  planId: Schema.String,
  mode: Schema.Literals(["trash", "delete"]),
  items: Schema.Array(StorageCleanupExecuteItem),
  processedTotals: StorageUsageTotals,
});
export type StorageCleanupExecuteResult = typeof StorageCleanupExecuteResult.Type;
export class StorageCleanupError extends Schema.TaggedError<StorageCleanupError>()(
  "StorageCleanupError",
  {
    detail: Schema.String,
    reason: Schema.Literals([
      "stale-snapshot",
      "invalid-selection",
      "expired-plan",
      "confirmation-required",
      "unsupported",
      "busy",
      "failed",
    ]),
  },
) {
  override get message() {
    return this.detail;
  }
}
