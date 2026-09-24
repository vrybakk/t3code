import {
  ClickUpError,
  ClickUpHandoff,
  ClickUpFindingsInput,
  ClickUpPrepareHandoffInput,
  ClickUpTaskDetails,
  ClickUpCompleteEstimationInput,
  ClickUpCompleteEstimationResult,
  McpCapabilityUnavailableError,
} from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import * as Tool from "effect/unstable/ai/Tool";
import * as Toolkit from "effect/unstable/ai/Toolkit";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import { ClickUpConnection } from "../../../clickup/ClickUpConnection.ts";
import { ClickUpTasks } from "../../../clickup/ClickUpTasks.ts";
import { ClickUpTaskEditing } from "../../../clickup/ClickUpTaskEditing.ts";
import { ClickUpWorkflow } from "../../../clickup/ClickUpWorkflow.ts";
import { McpInvocationContext } from "../../McpInvocationContext.ts";

const dependencies = [
  McpInvocationContext,
  SqlClient.SqlClient,
  ClickUpConnection,
  ClickUpTasks,
  ClickUpTaskEditing,
  ClickUpWorkflow,
];
const failure = Schema.Union([ClickUpError, McpCapabilityUnavailableError]);

const GetLinkedTask = Tool.make("get_linked_clickup_task", {
  description:
    "Read current ClickUp context for the task linked to this coding thread, including tags and time estimate. Use before estimating or checking changed requirements. Returns an error if this thread has no linked task. Task identity and credentials are supplied by Nerd, never by the agent.",
  success: ClickUpTaskDetails,
  failure,
  dependencies,
})
  .annotate(Tool.Readonly, true)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, true);

const CompleteEstimation = Tool.make("complete_clickup_estimation", {
  description:
    "Save an AI-assisted estimate in minutes for this thread's linked task, without overwriting any existing estimate, then remove its estimation needed tag if present only after verifying the saved value. A missing estimate can be saved without that tag. First read the task and research the code. Estimate work to a review-ready result with AI, including tests and likely fixes, not equivalent unaided human hours or time waiting for CTO review/deploy. Explain assumptions to the developer. Do not call in plan-only work. If tagRemoved is false, the estimate saved but tag cleanup failed: report partial success and reread before retrying. Never claim success on an error.",
  parameters: Schema.Struct({
    estimateMinutes: ClickUpCompleteEstimationInput.fields.estimateMinutes,
  }),
  success: ClickUpCompleteEstimationResult,
  failure,
  dependencies,
})
  .annotate(Tool.Readonly, false)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, false);

const StudioWorkflow = Tool.make("get_studio_task_workflow", {
  description:
    "Read the app-shipped studio workflow for this linked task. Read at every run or resume; follow the returned mode instructions.",
  parameters: Schema.Struct({ mode: Schema.Literals(["requirements", "estimate", "implement"]) }),
  success: Schema.Struct({
    version: Schema.String,
    mode: Schema.String,
    instructions: Schema.String,
  }),
  failure,
  dependencies,
})
  .annotate(Tool.Readonly, true)
  .annotate(Tool.Idempotent, true);

const StartImplementation = Tool.make("start_linked_clickup_implementation", {
  description:
    "Start authorized implementation of this thread's linked task. Checks the current no agent tag and changes status to In Progress. Never call for requirements or estimation only.",
  success: Schema.Void,
  failure,
  dependencies,
})
  .annotate(Tool.Readonly, false)
  .annotate(Tool.Idempotent, true);

const PostFindings = Tool.make("post_linked_clickup_findings", {
  description:
    "Post actionable requirements findings only. Use plain English, first person singular, at most four lines, no we/us/our or long dashes. Do not post success, status, or estimation comments. Identical findings are deduplicated. Never retry an uncertain delivery or rephrase it to bypass deduplication.",
  parameters: ClickUpFindingsInput,
  success: Schema.Void,
  failure,
  dependencies,
})
  .annotate(Tool.Readonly, false)
  .annotate(Tool.Idempotent, false);

const PrepareHandoff = Tool.make("prepare_linked_clickup_handoff", {
  description:
    "Prepare a durable developer review handoff for the linked task after independent review and verification. Include evidence (or the developer's explicit waiver) and every relevant registered PR URL with the exact headSha that was reviewed, across repositories. Supply a brief waiverSummary if evidence contains any explicit developer waiver. Summary is a final plain English comment, at most four lines without we/us/our or long dashes. Does not submit, request reviewers or move to Code Review. The developer must review and press Submit in the app.",
  parameters: ClickUpPrepareHandoffInput,
  success: ClickUpHandoff,
  failure,
  dependencies,
})
  .annotate(Tool.Readonly, false)
  .annotate(Tool.Idempotent, true);

export const ClickUpToolkit = Toolkit.make(
  GetLinkedTask,
  CompleteEstimation,
  StudioWorkflow,
  StartImplementation,
  PostFindings,
  PrepareHandoff,
);
