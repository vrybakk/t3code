import { arrayMove } from "@dnd-kit/sortable";
import { planPinnedReorder } from "@t3tools/client-runtime/state/thread-sort";
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

export type SidebarProjectThreadSection = "active" | "working" | "snoozed" | "settled";

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
  includeEmptyProjectKeys: readonly string[] = [],
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
    return group
      ? [group]
      : includeEmptyProjectKeys.includes(project.projectKey)
        ? [{ key: project.projectKey, project, threads: [] }]
        : [];
  });
  const knownKeys = new Set(projects.map((project) => project.projectKey));
  const unavailableGroups = [...groupsByKey.values()].filter((group) => !knownKeys.has(group.key));
  return [...knownGroups, ...unavailableGroups];
}

type StatusThread = Pick<
  SidebarThreadSummary,
  "hasPendingApprovals" | "hasPendingUserInput" | "runtime"
>;

export interface SidebarProjectThreadStatusCounts {
  readonly total: number;
  readonly idle: number;
  readonly running: number;
  readonly pending: number;
}

export function countSidebarProjectThreadStatuses(
  threads: readonly StatusThread[],
): SidebarProjectThreadStatusCounts {
  let idle = 0;
  let running = 0;
  let pending = 0;

  for (const thread of threads) {
    const status = resolveSidebarThreadStatus(thread);
    if (status === "working") {
      running += 1;
    } else if (status === "approval" || status === "input") {
      pending += 1;
    } else {
      idle += 1;
    }
  }

  return { total: threads.length, idle, running, pending };
}

export function resolveSidebarProjectGroupExpanded(
  projectExpandedById: Readonly<Record<string, boolean>>,
  expansionKey: string,
): boolean {
  return projectExpandedById[expansionKey] ?? expansionKey.startsWith("grouped:active:");
}

export function getVisibleSidebarProjectThreads<TProject, TThread>(
  sections: ReadonlyArray<{
    readonly section: SidebarProjectThreadSection;
    readonly groups: ReadonlyArray<SidebarProjectThreadGroup<TProject, TThread>>;
  }>,
  projectExpandedById: Readonly<Record<string, boolean>>,
  activeThread?: TThread,
): TThread[] {
  return sections.flatMap(({ groups, section }) =>
    groups.flatMap((group) =>
      resolveSidebarProjectGroupExpanded(
        projectExpandedById,
        sidebarProjectThreadGroupExpansionKey(section, group.key),
      )
        ? group.threads
        : group.threads.filter((thread) => thread === activeThread),
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

interface ReorderableGroupThread extends ProjectThreadLike {
  readonly id: string;
  readonly pinnedAt?: string | null;
  readonly pinOrderKey?: string | null;
  readonly activeOrderKey?: string | null;
}

function threadKey(thread: ReorderableGroupThread): string {
  return `${thread.environmentId}:${thread.id}`;
}

export function planSidebarProjectThreadReorder(
  groupThreads: readonly ReorderableGroupThread[],
  allThreads: readonly ReorderableGroupThread[],
  activeKey: string,
  overKey: string,
) {
  if (activeKey === overKey) return null;
  const active = groupThreads.find((thread) => threadKey(thread) === activeKey);
  const over = groupThreads.find((thread) => threadKey(thread) === overKey);
  if (!active || !over || (active.pinnedAt != null) !== (over.pinnedAt != null)) return null;
  const pinned = active.pinnedAt != null;
  const ordered = groupThreads.filter((thread) => (thread.pinnedAt != null) === pinned);
  const keys = ordered.map(threadKey);
  const desired = arrayMove(keys, keys.indexOf(activeKey), keys.indexOf(overKey));
  return {
    pinned,
    assignments: planPinnedReorder({
      orderedIds: desired,
      movedId: activeKey,
      keysById: new Map(
        allThreads.map((thread) => [
          threadKey(thread),
          pinned ? thread.pinOrderKey : thread.activeOrderKey,
        ]),
      ),
    }),
  };
}
