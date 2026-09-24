import { assert, it } from "@effect/vitest";
import * as Schema from "effect/Schema";
import { ApiTask, normalizeTask } from "./ClickUpApi.ts";

const base = {
  id: "task",
  team_id: "42",
  name: "Build",
  status: { status: "to do" },
  list: { id: "list", name: "MH App Dev Backlog" },
  folder: { id: "mobile", name: "MH Mobile App", hidden: false },
  space: { id: "mh", name: "MadHeads" },
};
const decodeTask = Schema.decodeUnknownSync(ApiTask);
const normalize = (value: unknown) => normalizeTask(decodeTask(value));

it("preserves source hierarchy and resolves a Project dropdown index to its stable option ID and color", () => {
  const task = normalize({
    ...base,
    custom_fields: [
      {
        id: "field",
        name: "Project",
        type: "drop_down",
        value: 0,
        type_config: {
          options: [{ id: "mobile-option", name: "MH App", orderindex: 0, color: "#112233" }],
        },
      },
    ],
  });
  assert.deepEqual(task.sources, [
    { kind: "project", fieldId: "field", id: "mobile-option", name: "MH App", color: "#112233" },
    { kind: "list", id: "list", name: "MH App Dev Backlog" },
    { kind: "folder", id: "mobile", name: "MH Mobile App" },
    { kind: "space", id: "mh", name: "MadHeads" },
  ]);
});

it("resolves labels by ID and excludes unrelated custom fields and synthetic folders", () => {
  const field = {
    id: "field",
    name: "Project",
    type: "labels",
    value: ["api", "web"],
    type_config: {
      options: [
        { id: "api", label: "API" },
        { id: "web", label: "Website" },
      ],
    },
  };
  const task = normalize({
    ...base,
    folder: { id: "hidden", name: "hidden", hidden: true },
    custom_fields: [field, { ...field, id: "other", name: "Department" }],
  });
  assert.deepEqual(
    task.sources.filter((source) => source.kind === "project").map((source) => source.id),
    ["api", "web"],
  );
  assert.equal(
    task.sources.some((source) => source.kind === "folder"),
    false,
  );
});

it("keeps source identity when optional names or custom fields are absent", () => {
  const task = normalize({ ...base, space: { id: "mh" }, custom_fields: null });
  assert.deepEqual(task.sources.at(-1), { kind: "space", id: "mh", name: "Space mh" });
});
