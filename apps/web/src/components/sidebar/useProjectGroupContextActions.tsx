import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import { scopeProjectRef, scopeThreadRef } from "@t3tools/client-runtime/environment";
import {
  isAtomCommandInterrupted,
  settlePromise,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import type { ContextMenuItem, SidebarProjectGroupingMode } from "@t3tools/contracts";
import { useCallback, useLayoutEffect, useRef, useState } from "react";

import { useComposerDraftStore } from "../../composerDraftStore";
import { useClientSettings, useUpdateClientSettings } from "../../hooks/useSettings";
import { releaseProjectDraftUploads } from "../../lib/composerDraftUploads";
import {
  deriveProjectGroupingOverrideKey,
  selectProjectGroupingSettings,
} from "../../logicalProject";
import { readLocalApi } from "../../localApi";
import type {
  SidebarProjectGroupMember,
  SidebarProjectSnapshot,
} from "../../sidebarProjectGrouping";
import { projectEnvironment } from "../../state/projects";
import { useAtomCommand } from "../../state/use-atom-command";
import { stackedThreadToast, toastManager } from "../ui/toast";
import { ProjectGroupActionDialogs } from "./ProjectGroupActionDialogs";

function memberLabel(member: SidebarProjectGroupMember, count: number): string {
  if (count === 1) return member.title;
  return member.environmentLabel
    ? `${member.environmentLabel} — ${member.workspaceRoot}`
    : member.workspaceRoot;
}

export function useProjectGroupContextActions({
  threads,
  copyPath,
}: {
  threads: readonly EnvironmentThreadShell[];
  copyPath: (path: string) => void;
}) {
  const [renameTarget, setRenameTarget] = useState<SidebarProjectGroupMember | null>(null);
  const [renameTitle, setRenameTitle] = useState("");
  const [groupingTarget, setGroupingTarget] = useState<SidebarProjectGroupMember | null>(null);
  const [groupingSelection, setGroupingSelection] = useState<
    SidebarProjectGroupingMode | "inherit"
  >("inherit");
  const threadsRef = useRef(threads);
  useLayoutEffect(() => {
    threadsRef.current = threads;
  }, [threads]);
  const groupingSettings = useClientSettings(selectProjectGroupingSettings);
  const updateSettings = useUpdateClientSettings();
  const updateProject = useAtomCommand(projectEnvironment.update, { reportFailure: false });
  const deleteProject = useAtomCommand(projectEnvironment.delete, { reportFailure: false });

  const closeRename = useCallback(() => {
    setRenameTarget(null);
    setRenameTitle("");
  }, []);
  const saveRename = useCallback(async () => {
    if (!renameTarget) return;
    const title = renameTitle.trim();
    if (!title) {
      toastManager.add({ type: "warning", title: "Project title cannot be empty" });
      return;
    }
    if (title === renameTarget.title) {
      closeRename();
      return;
    }
    const result = await updateProject({
      environmentId: renameTarget.environmentId,
      input: { projectId: renameTarget.id, title },
    });
    if (result._tag === "Success") closeRename();
    else if (!isAtomCommandInterrupted(result)) {
      const error = squashAtomCommandFailure(result);
      toastManager.add(
        stackedThreadToast({
          type: "error",
          title: "Failed to rename project",
          description: error instanceof Error ? error.message : "An error occurred.",
        }),
      );
    }
  }, [closeRename, renameTarget, renameTitle, updateProject]);

  const closeGrouping = useCallback(() => {
    setGroupingTarget(null);
    setGroupingSelection("inherit");
  }, []);
  const saveGrouping = useCallback(() => {
    if (!groupingTarget) return;
    const key = deriveProjectGroupingOverrideKey(groupingTarget);
    const overrides = { ...groupingSettings.sidebarProjectGroupingOverrides };
    if (groupingSelection === "inherit") delete overrides[key];
    else overrides[key] = groupingSelection;
    void updateSettings({ sidebarProjectGroupingOverrides: overrides });
    closeGrouping();
  }, [
    closeGrouping,
    groupingSelection,
    groupingSettings.sidebarProjectGroupingOverrides,
    groupingTarget,
    updateSettings,
  ]);

  const removeMember = useCallback(
    async (member: SidebarProjectGroupMember) => {
      const api = readLocalApi();
      if (!api) return;
      const matchingThreads = () =>
        threadsRef.current.filter(
          (thread) =>
            thread.environmentId === member.environmentId && thread.projectId === member.id,
        );
      const confirmAndRemove = async () => {
        const projectThreads = matchingThreads();
        const confirmed = await settlePromise(() =>
          api.dialogs.confirm(
            [
              projectThreads.length > 0
                ? `Remove project "${member.title}" and delete its ${projectThreads.length} thread${projectThreads.length === 1 ? "" : "s"}?`
                : `Remove project "${member.title}"?`,
              `Path: ${member.workspaceRoot}`,
              ...(member.environmentLabel ? [`Environment: ${member.environmentLabel}`] : []),
              projectThreads.length > 0
                ? "This permanently clears conversation history for those threads and any archived threads."
                : "This permanently clears any archived conversation history.",
              "This removes only this project entry, not its files on disk.",
              "This action cannot be undone.",
            ].join("\n"),
            { variant: "destructive" },
          ),
        );
        if (confirmed._tag === "Failure" || !confirmed.value) return;
        const result = await deleteProject({
          environmentId: member.environmentId,
          input: { projectId: member.id, force: true },
        });
        if (result._tag === "Failure") {
          if (!isAtomCommandInterrupted(result)) {
            const error = squashAtomCommandFailure(result);
            toastManager.add(
              stackedThreadToast({
                type: "error",
                title: `Failed to remove "${member.title}"`,
                description: error instanceof Error ? error.message : "An error occurred.",
              }),
            );
          }
          return;
        }
        const projectRef = scopeProjectRef(member.environmentId, member.id);
        releaseProjectDraftUploads(
          projectRef,
          projectThreads.map((thread) => scopeThreadRef(thread.environmentId, thread.id)),
        );
        const draftStore = useComposerDraftStore.getState();
        const draft = draftStore.getDraftThreadByProjectRef(projectRef);
        if (draft) draftStore.clearDraftThread(draft.draftId);
        draftStore.clearProjectDraftThreadId(projectRef);
      };
      if (matchingThreads().length === 0) {
        await confirmAndRemove();
        return;
      }
      const toastId = toastManager.add(
        stackedThreadToast({
          type: "warning",
          title: "Project is not empty",
          description: "Delete all threads in this project before removing it.",
          actionVariant: "destructive",
          actionProps: {
            children: "Delete anyway",
            onClick: () => {
              toastManager.close(toastId);
              window.setTimeout(() => void confirmAndRemove(), 180);
            },
          },
        }),
      );
    },
    [deleteProject],
  );

  const projectItems = useCallback(
    (project: SidebarProjectSnapshot) => {
      const handlers = new Map<string, () => void | Promise<void>>();
      const makeItem = (
        action: "rename" | "grouping" | "copy-path" | "remove",
        member: SidebarProjectGroupMember,
      ): ContextMenuItem => {
        const id = `project:${action}:${member.physicalProjectKey}`;
        handlers.set(id, () => {
          if (action === "rename") {
            setRenameTarget(member);
            setRenameTitle(member.title);
          } else if (action === "grouping") {
            setGroupingTarget(member);
            setGroupingSelection(
              groupingSettings.sidebarProjectGroupingOverrides?.[
                deriveProjectGroupingOverrideKey(member)
              ] ?? "inherit",
            );
          } else if (action === "copy-path") copyPath(member.workspaceRoot);
          else return removeMember(member);
        });
        return {
          id,
          label: memberLabel(member, project.memberProjects.length),
          ...(action === "remove" ? { destructive: true, icon: "trash" } : {}),
        };
      };
      const targeted = (
        action: "rename" | "grouping" | "copy-path" | "remove",
        label: string,
      ): ContextMenuItem => {
        if (project.memberProjects.length === 1) {
          return { ...makeItem(action, project.memberProjects[0]!), label };
        }
        return {
          id: `project:${action}:submenu`,
          label,
          ...(action === "remove" ? { icon: "trash" } : {}),
          children: project.memberProjects.map((member) => makeItem(action, member)),
        };
      };
      return {
        items: [
          targeted("rename", "Rename"),
          targeted("grouping", "Group into..."),
          targeted("copy-path", "Copy Path"),
          targeted("remove", "Remove"),
        ],
        handlers,
      };
    },
    [copyPath, groupingSettings.sidebarProjectGroupingOverrides, removeMember],
  );

  const dialogs = (
    <ProjectGroupActionDialogs
      renameTarget={renameTarget}
      renameTitle={renameTitle}
      setRenameTitle={setRenameTitle}
      closeRename={closeRename}
      saveRename={saveRename}
      groupingTarget={groupingTarget}
      groupingSelection={groupingSelection}
      setGroupingSelection={setGroupingSelection}
      groupingMode={groupingSettings.sidebarProjectGroupingMode}
      closeGrouping={closeGrouping}
      saveGrouping={saveGrouping}
    />
  );

  return { projectItems, dialogs };
}
