import type { ClickUpTaskSource } from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { ApiCustomField } from "./ClickUpCustomFields.ts";

const Location = Schema.Struct({
  id: Schema.String,
  name: Schema.optional(Schema.String),
  hidden: Schema.optional(Schema.Boolean),
});

export const ApiTaskSourceFields = {
  list: Schema.Struct({ id: Schema.optional(Schema.String), name: Schema.String }),
  folder: Schema.optional(Schema.NullOr(Location)),
  space: Schema.optional(Schema.NullOr(Location)),
  custom_fields: Schema.optional(Schema.NullOr(Schema.Array(ApiCustomField))),
};
const ApiTaskSources = Schema.Struct(ApiTaskSourceFields);

export function normalizeTaskSources(task: typeof ApiTaskSources.Type): ClickUpTaskSource[] {
  const sources: ClickUpTaskSource[] = [];
  for (const field of task.custom_fields ?? []) {
    if (
      field.name.trim().toLowerCase() !== "project" ||
      (field.type !== "drop_down" && field.type !== "labels") ||
      field.value == null
    )
      continue;
    const values = Array.isArray(field.value) ? field.value : [field.value];
    for (const value of values) {
      const option = field.type_config?.options?.find(
        (candidate) =>
          candidate.id === String(value) ||
          (field.type === "drop_down" &&
            candidate.orderindex != null &&
            String(candidate.orderindex) === String(value)),
      );
      if (option)
        sources.push({
          kind: "project",
          fieldId: field.id,
          id: option.id,
          name: option.name ?? option.label ?? option.id,
          color: option.color ?? null,
        });
    }
  }
  if (task.list.id) sources.push({ kind: "list", id: task.list.id, name: task.list.name });
  if (task.folder && !task.folder.hidden && task.folder.id !== "0")
    sources.push({
      kind: "folder",
      id: task.folder.id,
      name: task.folder.name ?? `Folder ${task.folder.id}`,
    });
  if (task.space)
    sources.push({
      kind: "space",
      id: task.space.id,
      name: task.space.name ?? `Space ${task.space.id}`,
    });
  return sources;
}
