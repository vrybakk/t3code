import * as Schema from "effect/Schema";
import { NonNegativeInt, PositiveInt, ThreadId, TrimmedNonEmptyString } from "./baseSchemas.ts";
import { ClickUpTaskReference } from "./clickup.ts";

export const ClickUpTimePreviewInput = Schema.Struct({
  userId: Schema.Int,
  threadId: Schema.optional(ThreadId),
  offset: NonNegativeInt,
});
export type ClickUpTimePreviewInput = typeof ClickUpTimePreviewInput.Type;
export const ClickUpTimeRecord = Schema.Struct({
  recordId: TrimmedNonEmptyString,
  fingerprint: TrimmedNonEmptyString,
  kind: Schema.Literals(["manual", "agent-turn"]),
  threadId: ThreadId,
  threadTitle: Schema.String,
  start: Schema.Number,
  duration: PositiveInt,
  tasks: Schema.Array(ClickUpTaskReference),
  state: Schema.Literals(["pending", "synced", "uncertain", "changed"]),
  destination: Schema.NullOr(ClickUpTaskReference),
});
export type ClickUpTimeRecord = typeof ClickUpTimeRecord.Type;
export const ClickUpTimePreview = Schema.Struct({
  records: Schema.Array(ClickUpTimeRecord),
  hasMore: Schema.Boolean,
  unlinkedCount: NonNegativeInt,
});
export const ClickUpTimeSelection = Schema.Struct({
  recordId: TrimmedNonEmptyString,
  fingerprint: TrimmedNonEmptyString,
  workspaceId: ClickUpTaskReference.fields.workspaceId,
  taskId: ClickUpTaskReference.fields.taskId,
});
export type ClickUpTimeSelection = typeof ClickUpTimeSelection.Type;
export const ClickUpTimeSyncInput = Schema.Struct({
  userId: Schema.Int,
  records: Schema.Array(ClickUpTimeSelection).check(Schema.isMinLength(1), Schema.isMaxLength(20)),
});
export type ClickUpTimeSyncInput = typeof ClickUpTimeSyncInput.Type;
export const ClickUpTimeSyncResult = Schema.Struct({
  results: Schema.Array(
    Schema.Struct({
      recordId: Schema.String,
      synced: Schema.Boolean,
      message: Schema.String,
    }),
  ),
});
