import * as Schema from "effect/Schema";
import { ClickUpTasksInput } from "./clickup.ts";

export const ClickUpSprintsInput = Schema.Struct({
  workspaceId: ClickUpTasksInput.fields.workspaceId,
  userId: ClickUpTasksInput.fields.userId,
});
export type ClickUpSprintsInput = typeof ClickUpSprintsInput.Type;

export const ClickUpSprint = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  startDate: Schema.NullOr(Schema.String),
  dueDate: Schema.NullOr(Schema.String),
  taskCount: Schema.NullOr(Schema.Number),
  state: Schema.Literals(["past", "active", "upcoming", "unknown"]),
});
export type ClickUpSprint = typeof ClickUpSprint.Type;

export const ClickUpSprintWindow = Schema.Struct({
  folderId: Schema.String,
  folderName: Schema.String,
  sprints: Schema.Array(ClickUpSprint),
  activeSprintId: Schema.NullOr(Schema.String),
});
export type ClickUpSprintWindow = typeof ClickUpSprintWindow.Type;
