import * as Schema from "effect/Schema";

const OptionalText = Schema.optional(Schema.NullOr(Schema.String));
const OptionalNumber = Schema.optional(Schema.NullOr(Schema.Union([Schema.String, Schema.Number])));
export const ApiCustomField = Schema.Struct({
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
              color: OptionalText,
              orderindex: OptionalNumber,
            }),
          ),
        ),
      }),
    ),
  ),
});

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

export function customFieldValue(field: typeof ApiCustomField.Type): string | null {
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
