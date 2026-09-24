import {
  ClickUpError,
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
import { McpInvocationContext } from "../../McpInvocationContext.ts";

const dependencies = [
  McpInvocationContext,
  SqlClient.SqlClient,
  ClickUpConnection,
  ClickUpTasks,
  ClickUpTaskEditing,
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
    "Save an AI-assisted estimate in minutes for this thread's linked task, then remove its estimation needed tag only after verifying the estimate was saved. First read the task and research the code. Estimate work to a review-ready result with AI, including tests and likely fixes, not equivalent unaided human hours or time waiting for CTO review/deploy. Explain assumptions to the developer. Do not call in plan-only work. If tagRemoved is false, the estimate saved but tag cleanup failed: report partial success and reread before retrying. Never claim success on an error.",
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

export const ClickUpToolkit = Toolkit.make(GetLinkedTask, CompleteEstimation);
