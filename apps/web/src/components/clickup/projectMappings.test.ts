import { ProjectId, type ClickUpTask } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";
import { clickUpSourceKey, resolveClickUpMapping } from "./projectMappings";

const mobile = ProjectId.make("mobile"),
  api = ProjectId.make("api"),
  web = ProjectId.make("web");
const task: ClickUpTask = {
  taskId: "task",
  workspaceId: "42",
  name: "Build",
  status: "to do",
  listName: "Backlog",
  description: "",
  sources: [
    { kind: "space", id: "mh", name: "MadHeads" },
    { kind: "folder", id: "mobile", name: "Mobile" },
    { kind: "list", id: "backlog", name: "Backlog" },
    { kind: "project", fieldId: "field", id: "option", name: "MH App" },
  ],
};
const key = (kind: "space" | "folder" | "list" | "project") =>
  clickUpSourceKey(
    "42",
    task.sources!.find((source) => source.kind === kind)!,
  );

describe("ClickUp repository mapping", () => {
  it("combines same-level Project labels and deduplicates their shared repository", () => {
    const labeled = {
      ...task,
      sources: [
        { kind: "project" as const, fieldId: "field", id: "mobile", name: "Mobile" },
        { kind: "project" as const, fieldId: "field", id: "web", name: "Web" },
      ],
    };
    expect(
      resolveClickUpMapping(labeled, {
        "42:project:field:mobile": [mobile, api],
        "42:project:field:web": [web, api],
      })?.projectIds,
    ).toEqual([mobile, api, web]);
  });
  it("uses the most specific matching scope rather than adding unrelated inherited repositories", () => {
    const mappings = {
      [key("space")]: [api],
      [key("folder")]: [mobile, api],
      [key("list")]: [web],
      [key("project")]: [mobile],
    };
    expect(resolveClickUpMapping(task, mappings)?.projectIds).toEqual([mobile]);
    delete mappings[key("project")];
    expect(resolveClickUpMapping(task, mappings)?.projectIds).toEqual([web]);
    delete mappings[key("list")];
    expect(resolveClickUpMapping(task, mappings)?.projectIds).toEqual([mobile, api]);
    delete mappings[key("folder")];
    expect(resolveClickUpMapping(task, mappings)?.projectIds).toEqual([api]);
    expect(resolveClickUpMapping(task, {})).toBeNull();
  });
  it("allows an API repository in multiple projects without crossing workspace or field identity", () => {
    const website: ClickUpTask = {
      ...task,
      sources: [{ kind: "folder", id: "website", name: "Website" }],
    };
    const mappings = { [key("folder")]: [mobile, api], "42:folder::website": [web, api] };
    expect(resolveClickUpMapping(task, mappings)?.projectIds).toEqual([mobile, api]);
    expect(resolveClickUpMapping(website, mappings)?.projectIds).toEqual([web, api]);
    expect(resolveClickUpMapping({ ...task, workspaceId: "other" }, mappings)).toBeNull();
    const renamed = {
      ...task,
      sources: task.sources!.map((source) => ({ ...source, name: "Renamed" })),
    };
    expect(resolveClickUpMapping(renamed, mappings)?.projectIds).toEqual([mobile, api]);
    expect(resolveClickUpMapping(task, { "42:project:other-field:option": [api] })).toBeNull();
  });
});
