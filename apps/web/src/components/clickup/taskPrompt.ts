import type { ClickUpTaskDetails, ClickUpWorkflowModels } from "@t3tools/contracts";

export type ClickUpTaskAction = "requirements" | "estimate" | "implement";

export function buildClickUpTaskPrompt(
  details: ClickUpTaskDetails,
  workflow?: {
    models: ClickUpWorkflowModels;
    repositories: ReadonlyArray<{ id: string; title: string; cwd?: string }>;
  },
): string {
  return [
    `$studio-task-workflow Start task ${details.task.taskId}: ${details.task.name}`,
    `Load get_studio_task_workflow with mode "implement", then get_linked_clickup_task.`,
    ...(workflow
      ? [
          `Workflow models (null inherits the lead model): ${JSON.stringify(workflow.models)}`,
          `Repository candidates: ${JSON.stringify(workflow.repositories)}`,
        ]
      : []),
  ].join("\n");
}

export function safeClickUpAttachmentUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}
