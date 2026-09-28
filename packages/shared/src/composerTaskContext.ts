import type {
  ComposerContextRecord,
  TaskContextRecord,
  ThreadClickUpTaskLink,
} from "@t3tools/contracts";
import { collectComposerContextReferences } from "./composerContextReferences.ts";

export function referencedTaskContexts(
  text: string,
  records: ReadonlyArray<ComposerContextRecord>,
): TaskContextRecord[] {
  const byId = new Map(
    records
      .filter(
        (record): record is TaskContextRecord => record.kind === "task" && !("payload" in record),
      )
      .map((record) => [record.contextId, record]),
  );
  const tasks = new Map<string, TaskContextRecord>();
  for (const reference of collectComposerContextReferences(text)) {
    const record = reference.kind === "task" ? byId.get(reference.contextId) : undefined;
    if (record) tasks.set(`${record.workspaceId}:${record.taskId}`, record);
  }
  return [...tasks.values()];
}

export function newTaskLinksFromMessage(
  text: string,
  records: ReadonlyArray<ComposerContextRecord>,
  existing: ReadonlyArray<ThreadClickUpTaskLink>,
): ThreadClickUpTaskLink[] {
  let hasPrimary = existing.some((task) => task.primary);
  return referencedTaskContexts(text, records).flatMap(({ workspaceId, taskId, name }) => {
    const linked = existing.find(
      (task) => task.workspaceId === workspaceId && task.taskId === taskId,
    );
    if (linked && hasPrimary) return [];
    const primary = !hasPrimary;
    hasPrimary = true;
    return [{ workspaceId, taskId, name, primary }];
  });
}
