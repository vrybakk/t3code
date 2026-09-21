import type { SidebarThreadSummary } from "../types";
import { resolveSidebarThreadStatus } from "./Sidebar.logic";

interface ProjectGroupLike {
  readonly projectKey: string;
  readonly memberProjectRefs: ReadonlyArray<{
    readonly environmentId: string;
    readonly projectId: string;
  }>;
}

interface ProjectThreadLike {
  readonly environmentId: string;
  readonly projectId: string;
}

export interface SidebarProjectThreadGroup<TProject, TThread> {
  readonly key: string;
  readonly project: TProject | null;
  readonly threads: TThread[];
}

export type SidebarProjectThreadSection = "active" | "snoozed" | "settled";

export function sidebarProjectThreadGroupExpansionKey(
  section: SidebarProjectThreadSection,
  groupKey: string,
): string {
  return `grouped:${section}:${groupKey}`;
}

function physicalProjectKey(thread: ProjectThreadLike): string {
  return `${thread.environmentId}:${thread.projectId}`;
}

export function groupSidebarThreadsByProject<
  TProject extends ProjectGroupLike,
  TThread extends ProjectThreadLike,
>(
  projects: readonly TProject[],
  threads: readonly TThread[],
): Array<SidebarProjectThreadGroup<TProject, TThread>> {
  const projectByMemberKey = new Map<string, TProject>();
  for (const project of projects) {
    for (const member of project.memberProjectRefs) {
      projectByMemberKey.set(`${member.environmentId}:${member.projectId}`, project);
    }
  }

  const groupsByKey = new Map<string, SidebarProjectThreadGroup<TProject, TThread>>();
  for (const thread of threads) {
    const memberKey = physicalProjectKey(thread);
    const project = projectByMemberKey.get(memberKey) ?? null;
    const key = project?.projectKey ?? `unavailable:${memberKey}`;
    const existing = groupsByKey.get(key);
    if (existing) {
      existing.threads.push(thread);
    } else {
      groupsByKey.set(key, { key, project, threads: [thread] });
    }
  }

  const knownGroups = projects.flatMap((project) => {
    const group = groupsByKey.get(project.projectKey);
    return group ? [group] : [];
  });
  const knownKeys = new Set(projects.map((project) => project.projectKey));
  const unavailableGroups = [...groupsByKey.values()].filter((group) => !knownKeys.has(group.key));
  return [...knownGroups, ...unavailableGroups];
}

type StatusThread = Pick<
  SidebarThreadSummary,
  "hasPendingApprovals" | "hasPendingUserInput" | "backgroundLiveness"
> & {
  readonly session: {
    readonly status: NonNullable<SidebarThreadSummary["session"]>["status"];
  } | null;
};

export interface SidebarProjectThreadStatusCounts {
  readonly total: number;
  readonly running: number;
  readonly pending: number;
}

export function countSidebarProjectThreadStatuses(
  threads: readonly StatusThread[],
): SidebarProjectThreadStatusCounts {
  let running = 0;
  let pending = 0;

  for (const thread of threads) {
    const status = resolveSidebarThreadStatus(thread);
    if (status === "working" || status === "monitoring") {
      running += 1;
    } else if (status === "approval" || status === "input") {
      pending += 1;
    }
  }

  return { total: threads.length, running, pending };
}

export function resolveSidebarProjectGroupExpanded(
  projectExpandedById: Readonly<Record<string, boolean>>,
  expansionKey: string,
): boolean {
  return projectExpandedById[expansionKey] ?? false;
}

export function getVisibleSidebarProjectThreads<TProject, TThread>(
  sections: ReadonlyArray<{
    readonly section: SidebarProjectThreadSection;
    readonly groups: ReadonlyArray<SidebarProjectThreadGroup<TProject, TThread>>;
  }>,
  projectExpandedById: Readonly<Record<string, boolean>>,
): TThread[] {
  return sections.flatMap(({ groups, section }) =>
    groups.flatMap((group) =>
      resolveSidebarProjectGroupExpanded(
        projectExpandedById,
        sidebarProjectThreadGroupExpansionKey(section, group.key),
      )
        ? group.threads
        : [],
    ),
  );
}

interface ReorderableSidebarProject {
  readonly projectKey: string;
  readonly memberProjects: ReadonlyArray<{ readonly physicalProjectKey: string }>;
}

export interface SidebarProjectGroupReorderPlan {
  readonly currentProjectOrder: readonly string[];
  readonly draggedProjectIds: readonly string[];
  readonly targetProjectIds: readonly string[];
}

export function planSidebarProjectGroupReorder(
  projects: readonly ReorderableSidebarProject[],
  activeProjectKey: string,
  overProjectKey: string,
): SidebarProjectGroupReorderPlan | null {
  if (activeProjectKey === overProjectKey) return null;
  const activeProject = projects.find((project) => project.projectKey === activeProjectKey);
  const overProject = projects.find((project) => project.projectKey === overProjectKey);
  if (activeProject === undefined || overProject === undefined) return null;

  return {
    currentProjectOrder: projects.flatMap((project) =>
      project.memberProjects.map((member) => member.physicalProjectKey),
    ),
    draggedProjectIds: activeProject.memberProjects.map((member) => member.physicalProjectKey),
    targetProjectIds: overProject.memberProjects.map((member) => member.physicalProjectKey),
  };
}
