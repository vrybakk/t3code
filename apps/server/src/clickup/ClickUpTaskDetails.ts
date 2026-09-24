import * as Schema from "effect/Schema";
import { ApiTask, ApiUser } from "./ClickUpApi.ts";

const OptionalText = Schema.optional(Schema.NullOr(Schema.String));
const OptionalNumber = Schema.optional(Schema.NullOr(Schema.Union([Schema.String, Schema.Number])));
const ApiCustomField = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  type: Schema.String,
  value: Schema.optional(Schema.Unknown),
  type_config: Schema.optional(
    Schema.NullOr(
      Schema.Struct({
        options: Schema.optional(
          Schema.Array(
            Schema.Struct({
              id: Schema.String,
              name: OptionalText,
              label: OptionalText,
              orderindex: OptionalNumber,
            }),
          ),
        ),
      }),
    ),
  ),
});

export const ApiTaskDetails = Schema.Struct({
  ...ApiTask.fields,
  assignees: Schema.optional(Schema.NullOr(Schema.Array(ApiUser))),
  creator: Schema.optional(Schema.NullOr(ApiUser)),
  watchers: Schema.optional(Schema.NullOr(Schema.Array(ApiUser))),
  priority: Schema.optional(Schema.NullOr(Schema.Struct({ priority: Schema.String }))),
  start_date: OptionalText,
  due_date: OptionalText,
  date_created: OptionalText,
  date_updated: OptionalText,
  date_closed: OptionalText,
  time_estimate: OptionalNumber,
  time_spent: OptionalNumber,
  tags: Schema.optional(Schema.NullOr(Schema.Array(Schema.Struct({ name: Schema.String })))),
  custom_fields: Schema.optional(Schema.NullOr(Schema.Array(ApiCustomField))),
  checklists: Schema.optional(
    Schema.NullOr(
      Schema.Array(
        Schema.Struct({
          id: Schema.String,
          name: Schema.String,
          items: Schema.optional(
            Schema.Array(
              Schema.Struct({
                id: Schema.String,
                name: Schema.String,
                resolved: Schema.Boolean,
              }),
            ),
          ),
        }),
      ),
    ),
  ),
  subtasks: Schema.optional(
    Schema.NullOr(
      Schema.Array(
        Schema.Struct({
          id: Schema.String,
          name: Schema.String,
          status: Schema.Struct({ status: Schema.String }),
        }),
      ),
    ),
  ),
  parent: OptionalText,
  dependencies: Schema.optional(
    Schema.NullOr(
      Schema.Array(
        Schema.Struct({
          task_id: Schema.String,
          depends_on: Schema.String,
        }),
      ),
    ),
  ),
  linked_tasks: Schema.optional(
    Schema.NullOr(
      Schema.Array(
        Schema.Struct({
          task_id: Schema.String,
          link_id: Schema.String,
        }),
      ),
    ),
  ),
});

export function nullableNumber(value: string | number | null | undefined): number | null {
  if (value === undefined || value === null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function valueText(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value))
    return (
      value
        .map(valueText)
        .filter((item) => item !== null)
        .join(", ") || null
    );
  if (typeof value === "object") {
    for (const key of ["name", "label", "username", "formatted_address", "current", "id"]) {
      if (key in value) return valueText(Reflect.get(value, key));
    }
    return JSON.stringify(value);
  }
  return null;
}

function customFieldValue(field: typeof ApiCustomField.Type): string | null {
  if (field.value === undefined || field.value === null) return null;
  if (field.type === "drop_down" || field.type === "labels") {
    const selected = Array.isArray(field.value) ? field.value : [field.value];
    return (
      selected
        .map((value) => {
          const option = field.type_config?.options?.find(
            (candidate) =>
              candidate.id === String(value) ||
              (field.type === "drop_down" &&
                candidate.orderindex != null &&
                String(candidate.orderindex) === String(value)),
          );
          return option?.name ?? option?.label ?? valueText(value);
        })
        .filter((value) => value !== null)
        .join(", ") || null
    );
  }
  if (field.type === "checkbox")
    return field.value === true || field.value === "true" ? "Yes" : "No";
  return valueText(field.value);
}

const normalizeUser = (user: typeof ApiUser.Type) => ({
  id: user.id,
  username: user.username ?? String(user.id),
  avatarUrl: user.profilePicture ?? null,
});

export function normalizeTaskMetadata(task: typeof ApiTaskDetails.Type) {
  const relatedTasks = [
    ...(task.parent ? [{ id: task.parent, label: "Parent task" }] : []),
    ...(task.dependencies ?? []).map((dependency) => ({
      id: dependency.task_id === task.id ? dependency.depends_on : dependency.task_id,
      label: dependency.task_id === task.id ? "Depends on" : "Blocking",
    })),
    ...(task.linked_tasks ?? []).map((link) => ({
      id: link.task_id === task.id ? link.link_id : link.task_id,
      label: "Linked task",
    })),
  ];
  return {
    assignees: (task.assignees ?? []).map(normalizeUser),
    creator: task.creator ? normalizeUser(task.creator) : null,
    watchers: (task.watchers ?? []).map(normalizeUser),
    priority: task.priority?.priority ?? null,
    startDate: task.start_date ?? null,
    dueDate: task.due_date ?? null,
    createdAt: task.date_created ?? null,
    updatedAt: task.date_updated ?? null,
    closedAt: task.date_closed ?? null,
    timeEstimate: nullableNumber(task.time_estimate),
    timeSpent: nullableNumber(task.time_spent),
    tags: (task.tags ?? []).map((tag) => tag.name),
    customFields: (task.custom_fields ?? []).map((field) => ({
      id: field.id,
      name: field.name,
      type: field.type,
      valueText: customFieldValue(field),
    })),
    checklists: (task.checklists ?? []).map((checklist) => ({
      ...checklist,
      items: checklist.items ?? [],
    })),
    subtasks: (task.subtasks ?? []).map((task) => ({
      id: task.id,
      name: task.name,
      status: task.status.status,
    })),
    relatedTasks,
  };
}
