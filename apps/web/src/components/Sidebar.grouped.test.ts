import { describe, expect, it } from "vite-plus/test";
import { EnvironmentId, ProjectId, ThreadId } from "@t3tools/contracts";
import {
  countSidebarProjectThreadStatuses,
  getVisibleSidebarProjectThreads,
  groupSidebarThreadsByProject,
  planSidebarProjectGroupReorder,
  resolveSidebarProjectGroupExpanded,
} from "./Sidebar.grouped";

describe("groupSidebarThreadsByProject", () => {
  const environmentA = EnvironmentId.make("environment-a");
  const environmentB = EnvironmentId.make("environment-b");
  const projectA = ProjectId.make("project-a");
  const projectB = ProjectId.make("project-b");

  it("groups physical projects under their logical project without changing thread order", () => {
    const projects = [
      {
        projectKey: "repo:shared",
        memberProjectRefs: [
          { environmentId: environmentA, projectId: projectA },
          { environmentId: environmentB, projectId: projectB },
        ],
      },
    ];
    const threads = [
      { environmentId: environmentB, projectId: projectB, id: "newest" },
      { environmentId: environmentA, projectId: projectA, id: "older" },
    ];

    expect(groupSidebarThreadsByProject(projects, threads)).toEqual([
      { key: "repo:shared", project: projects[0], threads },
    ]);
  });

  it("keeps transient threads visible until their project snapshot arrives", () => {
    const thread = { environmentId: environmentA, projectId: projectA, id: "orphan" };

    expect(groupSidebarThreadsByProject([], [thread])).toEqual([
      {
        key: `unavailable:${environmentA}:${projectA}`,
        project: null,
        threads: [thread],
      },
    ]);
  });

  it("keeps configured project order instead of first-thread encounter order", () => {
    const projects = [
      {
        projectKey: "project:first",
        memberProjectRefs: [{ environmentId: environmentA, projectId: projectA }],
      },
      {
        projectKey: "project:second",
        memberProjectRefs: [{ environmentId: environmentB, projectId: projectB }],
      },
    ];
    const threads = [
      { environmentId: environmentB, projectId: projectB, id: "newest" },
      { environmentId: environmentA, projectId: projectA, id: "older" },
    ];

    expect(groupSidebarThreadsByProject(projects, threads).map((group) => group.key)).toEqual([
      "project:first",
      "project:second",
    ]);
  });
});

describe("countSidebarProjectThreadStatuses", () => {
  const environmentId = EnvironmentId.make("environment-local");
  const makeThread = (input: {
    id: string;
    sessionStatus?: "running" | "error" | "ready";
    pendingInput?: boolean;
    pendingApproval?: boolean;
    backgroundLiveness?: "working" | "monitoring";
  }) => ({
    environmentId,
    id: ThreadId.make(input.id),
    hasPendingApprovals: input.pendingApproval ?? false,
    hasPendingUserInput: input.pendingInput ?? false,
    session: input.sessionStatus ? { status: input.sessionStatus } : null,
    backgroundLiveness: input.backgroundLiveness ?? null,
  });

  it("counts all, running, and pending threads", () => {
    expect(
      countSidebarProjectThreadStatuses([
        makeThread({ id: "working", sessionStatus: "running" }),
        makeThread({ id: "monitoring", backgroundLiveness: "monitoring" }),
        makeThread({ id: "input", pendingInput: true }),
        makeThread({ id: "approval", pendingApproval: true }),
        makeThread({ id: "failed", sessionStatus: "error" }),
        makeThread({ id: "idle", sessionStatus: "ready" }),
      ]),
    ).toEqual({ total: 6, running: 2, pending: 2 });
  });

  it("keeps zero-value counters explicit", () => {
    expect(countSidebarProjectThreadStatuses([makeThread({ id: "idle" })])).toEqual({
      total: 1,
      running: 0,
      pending: 0,
    });
  });
});

describe("project group preferences", () => {
  it("starts groups closed and preserves explicit choices", () => {
    expect(resolveSidebarProjectGroupExpanded({}, "grouped:active:project-a")).toBe(false);
    expect(
      resolveSidebarProjectGroupExpanded(
        { "grouped:active:project-a": true },
        "grouped:active:project-a",
      ),
    ).toBe(true);
  });

  it("moves every physical member of a logical project together", () => {
    expect(
      planSidebarProjectGroupReorder(
        [
          {
            projectKey: "repo:first",
            memberProjects: [
              { physicalProjectKey: "environment-a:project-a" },
              { physicalProjectKey: "environment-b:project-b" },
            ],
          },
          {
            projectKey: "repo:second",
            memberProjects: [{ physicalProjectKey: "environment-a:project-c" }],
          },
        ],
        "repo:first",
        "repo:second",
      ),
    ).toEqual({
      currentProjectOrder: [
        "environment-a:project-a",
        "environment-b:project-b",
        "environment-a:project-c",
      ],
      draggedProjectIds: ["environment-a:project-a", "environment-b:project-b"],
      targetProjectIds: ["environment-a:project-c"],
    });
  });
});

describe("getVisibleSidebarProjectThreads", () => {
  const project = null;
  const group = (key: string, threads: readonly string[]) => ({
    key,
    project,
    threads: [...threads],
  });

  it("follows rendered section and project order while omitting collapsed groups", () => {
    expect(
      getVisibleSidebarProjectThreads(
        [
          {
            section: "active",
            groups: [
              group("project:first", ["older-active"]),
              group("project:collapsed", ["newer-hidden"]),
              group("project:last", ["newest-active"]),
            ],
          },
          {
            section: "snoozed",
            groups: [group("project:first", ["snoozed-first"])],
          },
          {
            section: "settled",
            groups: [group("project:last", ["settled-last"])],
          },
        ],
        {
          "grouped:active:project:first": true,
          "grouped:active:project:collapsed": false,
          "grouped:active:project:last": true,
          "grouped:snoozed:project:first": true,
          "grouped:settled:project:last": true,
        },
      ),
    ).toEqual(["older-active", "newest-active", "snoozed-first", "settled-last"]);
  });

  it("treats groups without a saved preference as closed", () => {
    expect(
      getVisibleSidebarProjectThreads(
        [{ section: "active", groups: [group("project:first", ["hidden"])] }],
        {},
      ),
    ).toEqual([]);
  });
});
