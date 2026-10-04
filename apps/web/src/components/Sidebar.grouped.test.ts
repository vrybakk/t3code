import { describe, expect, it } from "vite-plus/test";
import { EnvironmentId, ProjectId, ProviderInstanceId, ThreadId } from "@t3tools/contracts";
import {
  countSidebarProjectThreadStatuses,
  getVisibleSidebarProjectThreads,
  groupSidebarThreadsByProject,
  planSidebarProjectGroupReorder,
  planSidebarProjectThreadReorder,
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

  it("keeps pinned group headers visible when no active chats remain", () => {
    const project = {
      projectKey: "repo:pinned",
      memberProjectRefs: [{ environmentId: environmentA, projectId: projectA }],
    };
    expect(groupSidebarThreadsByProject([project], [], [project.projectKey])).toEqual([
      { key: project.projectKey, project, threads: [] },
    ]);
    expect(groupSidebarThreadsByProject([project], [])).toEqual([]);
  });

  it("does not show pinned empty groups excluded by the project scope", () => {
    const alpha = {
      projectKey: "alpha",
      memberProjectRefs: [{ environmentId: environmentA, projectId: projectA }],
    };
    const beta = {
      projectKey: "beta",
      memberProjectRefs: [{ environmentId: environmentB, projectId: projectB }],
    };
    const pins = [beta.projectKey];
    const scopeKey = alpha.projectKey;
    const scopedThreads = [{ environmentId: environmentA, projectId: projectA, id: "alpha-chat" }];
    expect(
      groupSidebarThreadsByProject(
        [alpha, beta],
        scopedThreads,
        pins.filter((key) => key === scopeKey),
      ).map((group) => group.key),
    ).toEqual(["alpha"]);
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
    sessionStatus?: "running" | "failed" | "idle";
    pendingInput?: boolean;
    pendingApproval?: boolean;
  }) => ({
    environmentId,
    id: ThreadId.make(input.id),
    hasPendingApprovals: input.pendingApproval ?? false,
    hasPendingUserInput: input.pendingInput ?? false,
    runtime: input.sessionStatus
      ? {
          status: input.sessionStatus,
          activeRunId: null,
          providerInstanceId: ProviderInstanceId.make("codex"),
          providerName: null,
          lastError: null,
          updatedAt: "2026-10-04T00:00:00Z",
        }
      : null,
  });

  it("counts all, running, and pending threads", () => {
    expect(
      countSidebarProjectThreadStatuses([
        makeThread({ id: "working", sessionStatus: "running" }),
        makeThread({ id: "another-running", sessionStatus: "running" }),
        makeThread({ id: "input", pendingInput: true }),
        makeThread({ id: "approval", pendingApproval: true }),
        makeThread({ id: "failed", sessionStatus: "failed" }),
        makeThread({ id: "idle", sessionStatus: "idle" }),
      ]),
    ).toEqual({ total: 6, idle: 2, running: 2, pending: 2 });
  });

  it("counts an ordinary chat without overlapping active categories", () => {
    expect(countSidebarProjectThreadStatuses([makeThread({ id: "idle" })])).toEqual({
      total: 1,
      idle: 1,
      running: 0,
      pending: 0,
    });
  });

  it("counts a running chat only as running", () => {
    expect(
      countSidebarProjectThreadStatuses([makeThread({ id: "running", sessionStatus: "running" })]),
    ).toEqual({ total: 1, idle: 0, running: 1, pending: 0 });
  });

  it("counts a pending chat only as pending", () => {
    expect(
      countSidebarProjectThreadStatuses([makeThread({ id: "pending", pendingInput: true })]),
    ).toEqual({ total: 1, idle: 0, running: 0, pending: 1 });
  });

  it("separates pending chats from ordinary chats", () => {
    expect(
      countSidebarProjectThreadStatuses([
        makeThread({ id: "idle" }),
        makeThread({ id: "pending", pendingApproval: true }),
      ]),
    ).toEqual({ total: 2, idle: 1, running: 0, pending: 1 });
  });
});

describe("project group preferences", () => {
  it("starts active groups open and preserves explicit choices", () => {
    expect(resolveSidebarProjectGroupExpanded({}, "grouped:active:project-a")).toBe(true);
    expect(resolveSidebarProjectGroupExpanded({}, "grouped:settled:project-a")).toBe(false);
    expect(
      resolveSidebarProjectGroupExpanded(
        { "grouped:active:project-a": false },
        "grouped:active:project-a",
      ),
    ).toBe(false);
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

  it("keeps only the current chat visible inside a collapsed group", () => {
    expect(
      getVisibleSidebarProjectThreads(
        [{ section: "active", groups: [group("project:first", ["current", "hidden"])] }],
        { "grouped:active:project:first": false },
        "current",
      ),
    ).toEqual(["current"]);
  });

  it("shows active chats without a saved preference", () => {
    expect(
      getVisibleSidebarProjectThreads(
        [{ section: "active", groups: [group("project:first", ["hidden"])] }],
        {},
      ),
    ).toEqual(["hidden"]);
  });
});

describe("planSidebarProjectThreadReorder", () => {
  const thread = (
    id: string,
    pinned = false,
    orderKey: string | null = null,
    environmentId = "env",
  ) => ({
    id,
    environmentId,
    projectId: "project",
    pinnedAt: pinned ? "2026-10-04" : null,
    pinOrderKey: pinned ? orderKey : null,
    activeOrderKey: pinned ? null : orderKey,
  });

  it("reorders only the current group and pin tier while reserving hidden keys", () => {
    const group = [thread("pin", true), thread("first"), thread("second")];
    const hidden = thread("outside", false, "A");
    const plan = planSidebarProjectThreadReorder(
      group,
      [...group, hidden],
      "env:second",
      "env:first",
    );
    expect(plan?.pinned).toBe(false);
    expect(plan?.assignments.map((assignment) => assignment.id)).toEqual([
      "env:second",
      "env:first",
    ]);
    expect(
      plan?.assignments.some((assignment) => assignment.orderKey === hidden.activeOrderKey),
    ).toBe(false);
    expect(planSidebarProjectThreadReorder(group, group, "env:first", "env:pin")).toBeNull();
    expect(
      planSidebarProjectThreadReorder(group, [...group, hidden], "env:first", "env:outside"),
    ).toBeNull();
  });

  it("keeps same-named threads from different environments distinct", () => {
    const group = [thread("same", true, null, "local"), thread("same", true, null, "remote")];
    const plan = planSidebarProjectThreadReorder(group, group, "remote:same", "local:same");
    expect(plan?.pinned).toBe(true);
    expect(plan?.assignments.map((assignment) => assignment.id)).toEqual([
      "remote:same",
      "local:same",
    ]);
  });
});
