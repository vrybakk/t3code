import { EnvironmentId, ProjectId, type ClickUpTask } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";
import {
  clickUpLaunchProjectStorageKey,
  resolveClickUpLaunchProject,
} from "./taskProjectSelection";

const environment = EnvironmentId.make("local");
const api = { id: ProjectId.make("api"), title: "API" };
const web = { id: ProjectId.make("web"), title: "Website" };
const task: ClickUpTask = {
  taskId: "one",
  workspaceId: "42",
  name: "Fix checkout",
  status: "To do",
  listName: "Sprint",
  description: "",
  sources: [
    { kind: "project", fieldId: "field", id: "website", name: "Website" },
    { kind: "list", id: "sprint", name: "Sprint" },
  ],
};

describe("remembered task project scope", () => {
  it("follows the ClickUp project across tasks, sprints and renamed labels", () => {
    const next = {
      ...task,
      taskId: "two",
      sources: [
        { kind: "list" as const, id: "next-sprint", name: "Next sprint" },
        { ...task.sources![0]!, name: "Renamed" },
      ],
    };
    expect(clickUpLaunchProjectStorageKey(next, environment)).toBe(
      clickUpLaunchProjectStorageKey(task, environment),
    );
  });

  it("keeps unrelated projects, workspaces and environments separate", () => {
    const key = clickUpLaunchProjectStorageKey(task, environment);
    expect(clickUpLaunchProjectStorageKey(task, EnvironmentId.make("remote"))).not.toBe(key);
    expect(clickUpLaunchProjectStorageKey({ ...task, workspaceId: "other" }, environment)).not.toBe(
      key,
    );
    expect(
      clickUpLaunchProjectStorageKey(
        {
          ...task,
          sources: [{ ...task.sources![0]!, id: "other" }],
        },
        environment,
      ),
    ).not.toBe(key);
  });

  it("uses the source list when no project field exists and the task when no source exists", () => {
    const listTask = { ...task, sources: [task.sources![1]!] };
    expect(clickUpLaunchProjectStorageKey({ ...listTask, taskId: "two" }, environment)).toBe(
      clickUpLaunchProjectStorageKey(listTask, environment),
    );
    expect(
      clickUpLaunchProjectStorageKey({ ...task, sources: [], taskId: "two" }, environment),
    ).not.toBe(clickUpLaunchProjectStorageKey({ ...task, sources: [] }, environment));
  });
});

describe("task project preselection", () => {
  it("preselects the first linked project when several repositories are mapped", () => {
    expect(resolveClickUpLaunchProject(task, [api, web], [api, web], null)).toBe(api);
  });

  it("reuses an eligible selection and falls back when it was removed from the mapping", () => {
    expect(resolveClickUpLaunchProject(task, [api, web], [api, web], web.id)).toBe(web);
    expect(resolveClickUpLaunchProject(task, [api], [api], web.id)).toBe(api);
  });

  it("uses an exact source-name match before the first available unmapped project", () => {
    expect(resolveClickUpLaunchProject(task, [api, web], [], null)).toBe(web);
    expect(resolveClickUpLaunchProject({ ...task, sources: [] }, [api, web], [], null)).toBe(api);
    expect(resolveClickUpLaunchProject(task, [], [], web.id)).toBeNull();
  });
});
