import type { ClickUpTaskReference, TaskContextRecord } from "@t3tools/contracts";
import { sanitizeComposerContextLabel } from "@t3tools/shared/composerContextReferences";
import { toKindScopedComposerContextId } from "./composerContextReferences";

export function taskContextRecord(task: ClickUpTaskReference): TaskContextRecord {
  return {
    ...task,
    version: 1,
    kind: "task",
    contextId: toKindScopedComposerContextId("task", `${task.workspaceId}:${task.taskId}`),
    label: sanitizeComposerContextLabel(task.name, "task"),
  };
}
