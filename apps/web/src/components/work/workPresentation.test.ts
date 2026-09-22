import { describe, expect, it } from "vite-plus/test";
import type { WorkTrackingProject } from "@t3tools/contracts";
import { workPathName, workProjectLabels } from "./workPresentation";

const project = (id: string, name: string): WorkTrackingProject => ({
  id: id as WorkTrackingProject["id"],
  name,
  t3ProjectIds: [id as never],
  trackingEnabled: true,
  repositories: [],
  createdAt: "2026-09-22T00:00:00Z",
  updatedAt: "2026-09-22T00:00:00Z",
});

describe("Work project presentation", () => {
  it("distinguishes identically named workspaces without merging their ledger IDs", () => {
    const projects = [
      project("parent", "madheads"),
      project("child", "madheads"),
      project("other", "croni"),
    ];
    const labels = workProjectLabels(projects, [
      { id: "parent" as never, workspaceRoot: "/Users/person/clients/madheads" },
      { id: "child" as never, workspaceRoot: "/Users/person/clients/madheads/madheads" },
    ]);
    expect(labels.map((item) => item.name)).toEqual([
      "madheads · clients/madheads",
      "madheads · madheads/madheads",
      "croni",
    ]);
    expect(labels.map((item) => item.id)).toEqual(projects.map((item) => item.id));
  });
  it("distinguishes two ledger projects bound to the same path", () => {
    const labels = workProjectLabels(
      [project("first", "app"), project("second", "app")],
      [
        { id: "first" as never, workspaceRoot: "/workspace/app" },
        { id: "second" as never, workspaceRoot: "/workspace/app" },
      ],
    );
    expect(labels.map((item) => item.name)).toEqual(["app · first", "app · second"]);
  });
  it("shows directory names on both server platforms", () => {
    expect(workPathName("/projects/api/")).toBe("api");
    expect(workPathName("C:\\projects\\api")).toBe("api");
  });
});
