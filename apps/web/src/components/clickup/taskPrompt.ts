import type { ClickUpTaskDetails } from "@t3tools/contracts";

export type ClickUpTaskAction = "requirements" | "estimate" | "implement";

export function buildClickUpTaskPrompt(details: ClickUpTaskDetails): string {
  return `$studio-task-workflow Start task: ${details.task.name}`;
}

export function safeClickUpAttachmentUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}
