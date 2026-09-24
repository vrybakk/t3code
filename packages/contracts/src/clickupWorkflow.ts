import * as Schema from "effect/Schema";
import { ClickUpTaskInput } from "./clickup.ts";
import {
  IsoDateTime,
  PositiveInt,
  ProjectId,
  ThreadId,
  TrimmedNonEmptyString,
} from "./baseSchemas.ts";

export const ClickUpWorkflowText = TrimmedNonEmptyString.check(
  Schema.isMaxLength(2000),
  Schema.isPattern(
    /^(?![\s\S]*\b(?:we|us|our)\b)(?![\s\S]*[—–`])(?![\s\S]*\n[\s\S]*\n[\s\S]*\n[\s\S]*\n)[\s\S]+$/i,
  ),
);
export const ClickUpWorkflowEvidence = Schema.Struct({
  kind: Schema.Literals(["independent-review", "verification"]),
  outcome: Schema.Literals(["passed", "waived"]),
  details: TrimmedNonEmptyString.check(Schema.isMaxLength(4000)),
});
export const ClickUpHandoffPullRequest = Schema.Struct({
  projectId: ProjectId,
  host: TrimmedNonEmptyString,
  repository: TrimmedNonEmptyString,
  number: PositiveInt,
  url: TrimmedNonEmptyString,
  headSha: TrimmedNonEmptyString,
  ready: Schema.Boolean,
  reviewerRequested: Schema.Boolean,
});
export const ClickUpHandoff = Schema.Struct({
  id: TrimmedNonEmptyString,
  threadId: ThreadId,
  summary: ClickUpWorkflowText,
  taskScopeFingerprint: Schema.optional(TrimmedNonEmptyString),
  createdAt: IsoDateTime,
  status: Schema.Literals(["pending", "submitting", "submitted", "partial", "uncertain"]),
  error: Schema.NullOr(Schema.String),
  evidence: Schema.Array(ClickUpWorkflowEvidence),
  pullRequests: Schema.Array(ClickUpHandoffPullRequest),
  statusUpdated: Schema.Boolean,
  commentPosted: Schema.Boolean,
});
export type ClickUpHandoff = typeof ClickUpHandoff.Type;
export const ClickUpWorkflow = Schema.Struct({ handoffs: Schema.Array(ClickUpHandoff) });
export type ClickUpWorkflow = typeof ClickUpWorkflow.Type;
export const ClickUpWorkflowInput = ClickUpTaskInput;
export const ClickUpSubmitWorkflowInput = Schema.Struct({
  ...ClickUpTaskInput.fields,
  handoffId: TrimmedNonEmptyString,
});
export type ClickUpSubmitWorkflowInput = typeof ClickUpSubmitWorkflowInput.Type;
export const ClickUpFindingsInput = Schema.Struct({
  text: ClickUpWorkflowText,
  actionable: Schema.Literal(true),
});
export type ClickUpFindingsInput = typeof ClickUpFindingsInput.Type;
export const ClickUpPrepareHandoffInput = Schema.Struct({
  summary: ClickUpWorkflowText,
  reviewedTaskScope: TrimmedNonEmptyString,
  evidence: Schema.Array(ClickUpWorkflowEvidence).check(
    Schema.isMinLength(2),
    Schema.isMaxLength(20),
  ),
  waiverSummary: Schema.optional(ClickUpWorkflowText),
  reviewedHeads: Schema.Array(
    Schema.Struct({ url: TrimmedNonEmptyString, headSha: TrimmedNonEmptyString }),
  ).check(Schema.isMinLength(1), Schema.isMaxLength(20)),
});
export type ClickUpPrepareHandoffInput = typeof ClickUpPrepareHandoffInput.Type;
