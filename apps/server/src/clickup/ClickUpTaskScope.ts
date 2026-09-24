import * as NodeCrypto from "node:crypto";
import type { ClickUpTask } from "@t3tools/contracts";

export function taskScopeFingerprint(
  task: Pick<ClickUpTask, "workspaceId" | "taskId" | "name" | "description">,
): string {
  // Workflow status and routine comments are not changes to the reviewed task definition.
  return NodeCrypto.createHash("sha256")
    .update(JSON.stringify([1, task.workspaceId, task.taskId, task.name, task.description]))
    .digest("hex");
}
