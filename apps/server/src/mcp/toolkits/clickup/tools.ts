import { ProjectCloneTracker } from "../../../project/ProjectCloneTracker.ts";
import { ServerSettingsService } from "../../../serverSettings.ts";
import { ProjectionSnapshotQuery } from "../../../orchestration/Services/ProjectionSnapshotQuery.ts";
import { RepositoryIdentityResolver } from "../../../project/RepositoryIdentityResolver.ts";
import {
  ClickUpError,
  ClickUpHandoff,
  ClickUpFindingsInput,
  ClickUpPrepareHandoffInput,
  ClickUpTaskDetails,
  ClickUpTaskInput,
  ClickUpCompleteEstimationInput,
  ClickUpCompleteEstimationResult,
  ClickUpCommentsInput,
  ClickUpCommentsPage,
  ClickUpCommentRepliesInput,
  ClickUpCommentReplies,
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
import { ClickUpInteractions } from "../../../clickup/ClickUpInteractions.ts";
import { McpInvocationContext } from "../../McpInvocationContext.ts";

const dependencies = [
  McpInvocationContext,
  SqlClient.SqlClient,
  ClickUpConnection,
  ClickUpTasks,
  ClickUpTaskEditing,
  ClickUpWorkflow,
  ClickUpInteractions,
];
const failure = Schema.Union([ClickUpError, McpCapabilityUnavailableError]);
const linkedTaskFields = {
  task: Schema.optional(
    Schema.Struct({
      workspaceId: ClickUpTaskInput.fields.workspaceId,
      taskId: ClickUpTaskInput.fields.taskId,
    }),
  ),
};
const linkedTaskDescription =
  " Omit task to use this thread's primary task. To select another task already linked to this thread, pass task with both workspaceId and taskId on every call. Nerd verifies that link and supplies credentials. This does not change the primary task.";

const GetLinkedTask = Tool.make("get_linked_clickup_task", {
  description:
    "Read current ClickUp context for the task linked to this coding thread, including tags and time estimate. Use before estimating or checking changed requirements. Returns an error if this thread has no linked task." +
    linkedTaskDescription,
  parameters: Schema.Struct(linkedTaskFields),
  success: ClickUpTaskDetails,
  failure,
  dependencies,
})
  .annotate(Tool.Readonly, true)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, true);

const GetLinkedComments = Tool.make("get_linked_clickup_comments", {
  description:
    "Read comments on this thread's linked ClickUp task, newest first. Omit cursor for the first page; pass the returned nextCursor to read older pages while hasMore is true. Keep the cursor used to load each page when reading replies to its comments." +
    linkedTaskDescription,
  parameters: Schema.Struct({ ...linkedTaskFields, cursor: ClickUpCommentsInput.fields.cursor }),
  success: ClickUpCommentsPage,
  failure,
  dependencies,
})
  .annotate(Tool.Readonly, true)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, true);

const GetLinkedCommentReplies = Tool.make("get_linked_clickup_comment_replies", {
  description:
    "Read replies to a comment on this thread's linked ClickUp task. Pass commentId and the cursor used to load the parent comment's page, not that page's nextCursor; omit cursor for a parent on the first page. Nerd verifies the parent belongs to that task page before reading replies." +
    linkedTaskDescription,
  parameters: Schema.Struct({
    ...linkedTaskFields,
    commentId: ClickUpCommentRepliesInput.fields.commentId,
    cursor: ClickUpCommentRepliesInput.fields.cursor,
  }),
  success: ClickUpCommentReplies,
  failure,
  dependencies,
})
  .annotate(Tool.Readonly, true)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, true);

const CompleteEstimation = Tool.make("complete_clickup_estimation", {
  description:
    "Save an AI-assisted estimate in minutes for this thread's linked task, without overwriting any existing estimate, then remove its estimation needed tag if present only after verifying the saved value. A missing estimate can be saved without that tag. First read the task and research the code. Estimate work to a review-ready result with AI, including tests and likely fixes, not equivalent unaided human hours or time waiting for CTO review/deploy. Explain assumptions to the developer. Do not call in plan-only work. If tagRemoved is false, the estimate saved but tag cleanup failed: report partial success and reread before retrying. Never claim success on an error." +
    linkedTaskDescription,
  parameters: Schema.Struct({
    ...linkedTaskFields,
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
    "Read the app-shipped studio workflow for this linked task. Read at every run or resume; follow the returned mode instructions, current model preferences and repository candidates." +
    linkedTaskDescription,
  parameters: Schema.Struct({
    ...linkedTaskFields,
    mode: Schema.Literals(["requirements", "estimate", "implement"]),
  }),
  success: Schema.Struct({
    version: Schema.String,
    mode: Schema.String,
    instructions: Schema.String,
  }),
  failure,
  dependencies: [
    ...dependencies,
    ServerSettingsService,
    ProjectionSnapshotQuery,
    RepositoryIdentityResolver,
    ProjectCloneTracker,
  ],
})
  .annotate(Tool.Readonly, true)
  .annotate(Tool.Idempotent, true);

const StartImplementation = Tool.make("start_linked_clickup_implementation", {
  description:
    "Start authorized implementation of this thread's linked task. Checks the current no agent tag and changes status to In Progress. Never call for requirements or estimation only." +
    linkedTaskDescription,
  parameters: Schema.Struct(linkedTaskFields),
  success: Schema.Void,
  failure,
  dependencies,
})
  .annotate(Tool.Readonly, false)
  .annotate(Tool.Idempotent, true);

const PostFindings = Tool.make("post_linked_clickup_findings", {
  description:
    "Post actionable requirements findings only. Use plain English, first person singular, at most four lines, no we/us/our or long dashes. Do not post success, status, or estimation comments. Identical findings are deduplicated. Never retry an uncertain delivery or rephrase it to bypass deduplication." +
    linkedTaskDescription,
  parameters: Schema.Struct({ ...ClickUpFindingsInput.fields, ...linkedTaskFields }),
  success: Schema.Void,
  failure,
  dependencies,
})
  .annotate(Tool.Readonly, false)
  .annotate(Tool.Idempotent, false);

const PrepareHandoff = Tool.make("prepare_linked_clickup_handoff", {
  description:
    "Prepare a durable developer review handoff for the linked task after independent review and verification. Pass reviewedTaskScope from the scopeFingerprint returned by get_linked_clickup_task for the requirements you reviewed. Include evidence (or the developer's explicit waiver) and every relevant registered PR URL with the exact headSha that was reviewed, across repositories. Supply a brief waiverSummary if evidence contains any explicit developer waiver. Summary is a final plain English comment, at most four lines without we/us/our or long dashes. Does not submit, request reviewers or move to Code Review. The developer must review and press Submit in the app." +
    linkedTaskDescription,
  parameters: Schema.Struct({ ...ClickUpPrepareHandoffInput.fields, ...linkedTaskFields }),
  success: ClickUpHandoff,
  failure,
  dependencies,
})
  .annotate(Tool.Readonly, false)
  .annotate(Tool.Idempotent, true);

export const ClickUpToolkit = Toolkit.make(
  GetLinkedTask,
  GetLinkedComments,
  GetLinkedCommentReplies,
  CompleteEstimation,
  StudioWorkflow,
  StartImplementation,
  PostFindings,
  PrepareHandoff,
);
