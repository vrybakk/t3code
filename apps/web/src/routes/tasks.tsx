import { createFileRoute } from "@tanstack/react-router";
import { EnvironmentId } from "@t3tools/contracts";
import { ClickUpPage } from "../components/clickup/ClickUpPage";

export const Route = createFileRoute("/tasks")({
  validateSearch: (raw: Record<string, unknown>) => ({
    ...(raw.showAll === true ? { showAll: true } : {}),
    ...(typeof raw.environmentId === "string" && raw.environmentId
      ? { environmentId: EnvironmentId.make(raw.environmentId) }
      : {}),
    ...(typeof raw.workspaceId === "string" && /^[a-zA-Z0-9_-]{1,128}$/.test(raw.workspaceId)
      ? { workspaceId: raw.workspaceId }
      : {}),
    ...(typeof raw.taskId === "string" && /^[a-zA-Z0-9_-]{1,128}$/.test(raw.taskId)
      ? { taskId: raw.taskId }
      : {}),
    ...(typeof raw.sprintId === "string" && /^[a-zA-Z0-9_-]{1,128}$/.test(raw.sprintId)
      ? { sprintId: raw.sprintId }
      : {}),
    ...(typeof raw.page === "number" && Number.isSafeInteger(raw.page) && raw.page > 0
      ? { page: raw.page }
      : {}),
  }),
  component: ClickUpPage,
});
