import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import type { ClickUpApi } from "./ClickUpApi.ts";

const decodeCatalog = Schema.decodeUnknownEffect(
  Schema.Struct({
    custom_items: Schema.Array(Schema.Struct({ id: Schema.Int, name: Schema.String })),
  }),
);

export function nativeTaskType(
  customItemId: number | null | undefined,
  catalog?: ReadonlyMap<number, string>,
): { id: number; name: string } {
  const id = customItemId ?? 0;
  if (id === 0) return { id, name: "Task" };
  if (id === 1) return { id, name: "Milestone" };
  return { id, name: catalog?.get(id) ?? "Unknown type" };
}

export const readTaskTypes = Effect.fn("ClickUpTasks.readTaskTypes")(function* (
  api: ClickUpApi["Service"],
  token: string,
  workspaceId: string,
) {
  return yield* api.request(`team/${encodeURIComponent(workspaceId)}/custom_item`, { token }).pipe(
    Effect.flatMap(decodeCatalog),
    Effect.map((response) => new Map(response.custom_items.map((item) => [item.id, item.name]))),
    // Optional type metadata must not hide tasks the account can otherwise read.
    Effect.catch(() => Effect.succeed(new Map<number, string>())),
  );
});
