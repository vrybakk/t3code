import { assert, it } from "@effect/vitest";
import * as Schema from "effect/Schema";
import { ApiTaskDetails, normalizeTaskMetadata } from "./ClickUpTaskDetails.ts";

const base = {
  id: "task-1",
  team_id: "workspace-1",
  name: "Build checkout",
  status: { status: "in progress" },
  list: { name: "Sprint" },
};
const decodeTaskDetails = Schema.decodeUnknownSync(ApiTaskDetails);
const normalize = (value: unknown) => normalizeTaskMetadata(decodeTaskDetails(value));

it("normalizes rich task details without forwarding provider objects", () => {
  const person = {
    id: 12,
    username: "Developer",
    profilePicture: "https://example.test/avatar.png",
  };
  const result = normalize({
    ...base,
    assignees: [person],
    creator: person,
    watchers: [person],
    priority: { priority: "high" },
    start_date: "1700000000000",
    due_date: "1700100000000",
    date_created: "1690000000000",
    date_updated: "1700050000000",
    date_closed: null,
    time_estimate: "3600000",
    time_spent: 0,
    tags: [{ name: "frontend", tag_bg: "#fff" }],
    checklists: [
      {
        id: "check-1",
        name: "QA",
        items: [{ id: "item-1", name: "Mobile", resolved: true, orderindex: 0 }],
      },
    ],
    subtasks: [{ id: "sub-1", name: "Tests", status: { status: "open" } }],
    parent: "parent-1",
    dependencies: [
      { task_id: "task-1", depends_on: "before-1" },
      { task_id: "after-1", depends_on: "task-1" },
    ],
    linked_tasks: [{ task_id: "task-1", link_id: "linked-1" }],
  });
  assert.deepEqual(result.assignees, [
    { id: 12, username: "Developer", avatarUrl: person.profilePicture },
  ]);
  assert.deepEqual(result.creator, result.assignees[0]);
  assert.deepEqual(result.watchers, result.assignees);
  assert.equal(result.priority, "high");
  assert.equal(result.startDate, "1700000000000");
  assert.equal(result.dueDate, "1700100000000");
  assert.equal(result.createdAt, "1690000000000");
  assert.equal(result.updatedAt, "1700050000000");
  assert.equal(result.closedAt, null);
  assert.equal(result.timeEstimate, 3600000);
  assert.equal(result.timeSpent, 0);
  assert.deepEqual(result.tags, ["frontend"]);
  assert.deepEqual(result.checklists, [
    {
      id: "check-1",
      name: "QA",
      items: [{ id: "item-1", name: "Mobile", resolved: true, assignee: null }],
    },
  ]);
  assert.deepEqual(result.subtasks, [{ id: "sub-1", name: "Tests", status: "open" }]);
  assert.deepEqual(result.relatedTasks, [
    { id: "parent-1", label: "Parent task" },
    { id: "before-1", label: "Depends on" },
    { id: "after-1", label: "Blocking" },
    { id: "linked-1", label: "Linked task" },
  ]);
});

it("resolves dropdown zero and option IDs, label choices and people", () => {
  const dropdown = {
    id: "dropdown",
    name: "Stage",
    type: "drop_down",
    type_config: {
      options: [
        { id: "second", name: "Second", orderindex: 1 },
        { id: "first", name: "First", orderindex: "0" },
      ],
    },
  };
  const result = normalize({
    ...base,
    custom_fields: [
      { ...dropdown, value: 0 },
      { ...dropdown, id: "by-id", value: "second" },
      {
        id: "labels",
        name: "Scope",
        type: "labels",
        value: ["a", "b"],
        type_config: {
          options: [
            { id: "a", label: "Web" },
            { id: "b", label: "Mobile" },
          ],
        },
      },
      { id: "people", name: "Reviewer", type: "users", value: [{ id: 12, username: "Developer" }] },
      { id: "count", name: "Count", type: "number", value: 0 },
      { id: "checked", name: "Approved", type: "checkbox", value: false },
      { id: "missing", name: "Missing", type: "short_text" },
      { id: "null", name: "Null", type: "short_text", value: null },
    ],
  });
  assert.deepEqual(
    result.customFields.map((field) => field.valueText),
    ["First", "Second", "Web, Mobile", "Developer", "0", "No", null, null],
  );
});

it("defaults missing and nullable metadata without losing zero values", () => {
  const missing = normalize(base);
  assert.deepEqual(
    missing,
    normalize({
      ...base,
      creator: null,
      priority: null,
      assignees: null,
      watchers: null,
      time_estimate: null,
      custom_fields: null,
      checklists: null,
      subtasks: null,
      dependencies: null,
      linked_tasks: null,
    }),
  );
  assert.deepEqual(missing.assignees, []);
  assert.deepEqual(missing.customFields, []);
  assert.deepEqual(missing.checklists, []);
  assert.deepEqual(missing.relatedTasks, []);
  assert.equal(missing.creator, null);
  assert.equal(missing.timeEstimate, null);
  assert.equal(missing.createdAt, null);
});

it("normalizes checklist assignees as users and accepts unassigned items", () => {
  const result = normalize({
    ...base,
    checklists: [
      {
        id: "check-1",
        name: "QA",
        items: [
          {
            id: "assigned",
            name: "Verify",
            resolved: false,
            assignee: {
              id: 23,
              username: "Reviewer",
              profilePicture: "https://example.test/user.png",
            },
          },
          { id: "unassigned", name: "Test", resolved: false, assignee: null },
        ],
      },
    ],
  });
  assert.deepEqual(result.checklists[0]?.items[0]?.assignee, {
    id: 23,
    username: "Reviewer",
    avatarUrl: "https://example.test/user.png",
  });
  assert.equal(result.checklists[0]?.items[1]?.assignee, null);
});
