import * as Schema from "effect/Schema";
import { ClickUpTaskInput } from "./clickup.ts";
import { PositiveInt, TrimmedNonEmptyString } from "./baseSchemas.ts";

export const ClickUpTaskOptions = Schema.Struct({
  statuses: Schema.Array(
    Schema.Struct({
      name: Schema.String,
      color: Schema.NullOr(Schema.String),
      type: Schema.NullOr(Schema.String),
    }),
  ),
  tags: Schema.Array(Schema.Struct({ name: Schema.String, color: Schema.NullOr(Schema.String) })),
  currentTags: Schema.Array(Schema.String),
  status: Schema.String,
});
export type ClickUpTaskOptions = typeof ClickUpTaskOptions.Type;
export const ClickUpSetStatusInput = Schema.Struct({
  ...ClickUpTaskInput.fields,
  status: TrimmedNonEmptyString.check(Schema.isMaxLength(1024)),
});
export type ClickUpSetStatusInput = typeof ClickUpSetStatusInput.Type;
export const ClickUpSetTagInput = Schema.Struct({
  ...ClickUpTaskInput.fields,
  tag: TrimmedNonEmptyString.check(Schema.isMaxLength(1024)),
  present: Schema.Boolean,
});
export type ClickUpSetTagInput = typeof ClickUpSetTagInput.Type;
export const ClickUpCompleteEstimationInput = Schema.Struct({
  ...ClickUpTaskInput.fields,
  estimateMinutes: PositiveInt.check(
    Schema.isLessThanOrEqualTo(Math.floor(Number.MAX_SAFE_INTEGER / 60000)),
  ),
});
export type ClickUpCompleteEstimationInput = typeof ClickUpCompleteEstimationInput.Type;
export const ClickUpCompleteEstimationResult = Schema.Struct({
  estimateMinutes: PositiveInt,
  tagRemoved: Schema.Boolean,
});
export type ClickUpCompleteEstimationResult = typeof ClickUpCompleteEstimationResult.Type;
