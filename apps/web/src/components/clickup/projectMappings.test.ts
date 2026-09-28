import { ProjectId, type ClickUpTask } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";
import {
  clickUpSourceKey,
  resolveClickUpMapping,
  resolveClickUpRepositories,
  suggestClickUpRepository,
  githubRepositoryName,
  savedGithubRepositoryUrl,
} from "./projectMappings";

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

describe("known repository resolution", () => {
  const identity = {
    canonicalKey: "github:nerd/api",
    locator: {
      source: "git-remote" as const,
      remoteName: "origin",
      remoteUrl: "git@github.com:nerd/api.git",
    },
    name: "api",
  };
  const projects = [{ id: api, title: "API", repositoryIdentity: identity }];
  it("preserves scope priority when only a remote URL is known", () => {
    const mapping = resolveClickUpMapping(
      task,
      { [key("space")]: [web] },
      { [key("project")]: [{ remoteUrl: "https://github.com/nerd/api" }] },
    );
    expect(mapping?.projectIds).toEqual([]);
    expect(resolveClickUpRepositories(mapping, projects)).toEqual({ projects, missing: [] });
  });
  it("reuses the same repository for multiple scopes without agent requests", () => {
    const repositories = {
      [key("project")]: [{ remoteUrl: "https://github.com/NERD/API" }],
      [key("folder")]: [{ remoteUrl: "git@github.com:nerd/api.git" }],
    };
    expect(
      resolveClickUpRepositories(resolveClickUpMapping(task, {}, repositories), projects).projects,
    ).toEqual(projects);
    expect(
      resolveClickUpRepositories(
        resolveClickUpMapping(
          { ...task, sources: task.sources!.filter((source) => source.kind !== "project") },
          {},
          repositories,
        ),
        projects,
      ).projects,
    ).toEqual(projects);
  });
  it("does not treat a stale saved project as a ready repository", () => {
    const mapping = resolveClickUpMapping(
      task,
      { [key("project")]: [api] },
      { [key("project")]: [{ remoteUrl: "https://github.com/nerd/api", projectId: api }] },
    );
    expect(
      resolveClickUpRepositories(mapping, [{ id: api, title: "API", repositoryIdentity: null }]),
    ).toEqual({ projects: [], missing: mapping!.repositories });
  });
  it("only suggests unique exact names and rejects ambiguous or partial matches", () => {
    const source = { kind: "project" as const, id: "p", name: "api" };
    expect(suggestClickUpRepository(source, projects)).toEqual(projects[0]);
    expect(suggestClickUpRepository(source, [...projects, { id: web, title: "API" }])).toBeNull();
    expect(suggestClickUpRepository({ ...source, name: "API Website" }, projects)).toBeNull();
  });
  it("accepts GitHub HTTPS or SSH identities without credentials or other URLs", () => {
    expect(githubRepositoryName("https://github.com/nerd/api.git")).toBe("nerd/api");
    expect(githubRepositoryName("git@github.com:nerd/api.git")).toBe("nerd/api");
    expect(githubRepositoryName("https://token@github.com/nerd/api")).toBeNull();
    expect(githubRepositoryName("https://github.com/nerd/api/issues")).toBeNull();
  });
});

it("retains a credential-free GitHub identity from a local Git remote", () => {
  expect(savedGithubRepositoryUrl("https://user:secret@github.com/company/api.git")).toBe(
    "https://github.com/company/api",
  );
  expect(savedGithubRepositoryUrl("ssh://git@github.com/company/api.git")).toBe(
    "https://github.com/company/api",
  );
  expect(savedGithubRepositoryUrl("https://gitlab.com/company/api")).toBeNull();
});
