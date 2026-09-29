import * as Schema from "effect/Schema";
import { NonNegativeInt, PositiveInt, TrimmedNonEmptyString } from "./baseSchemas.ts";

const RepositoryRequest = Schema.Struct({
  repository: NonNegativeInt,
  value: TrimmedNonEmptyString.check(Schema.isMaxLength(512)),
});
export const TaskEstimationResponse = Schema.Struct({
  summary: TrimmedNonEmptyString.check(Schema.isMaxLength(4000)),
  searches: Schema.Array(RepositoryRequest).check(Schema.isMaxLength(4)),
  files: Schema.Array(RepositoryRequest).check(Schema.isMaxLength(8)),
  estimate: Schema.NullOr(
    Schema.Struct({
      implementationMinutes: PositiveInt,
      verificationMinutes: NonNegativeInt,
      followUpMinutes: NonNegativeInt,
      confidence: Schema.Literals(["low", "medium", "high"]),
      blockers: Schema.Array(Schema.String).check(Schema.isMaxLength(6)),
    }),
  ),
});
export type TaskEstimationResponse = typeof TaskEstimationResponse.Type;
export const TaskEstimationFinalResponse = Schema.Struct({
  ...TaskEstimationResponse.fields,
  searches: Schema.Array(RepositoryRequest).check(Schema.isMaxLength(0)),
  files: Schema.Array(RepositoryRequest).check(Schema.isMaxLength(0)),
});
export const TaskEstimationEvidence = Schema.Struct({
  implementationMinutes: NonNegativeInt,
  verificationMinutes: NonNegativeInt,
  followUpMinutes: NonNegativeInt,
  confidence: Schema.Literals(["low", "medium", "high"]),
  files: Schema.Array(Schema.String),
  limitations: Schema.Array(Schema.String),
});
export type TaskEstimationEvidence = typeof TaskEstimationEvidence.Type;
