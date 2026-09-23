import * as NodeCrypto from "node:crypto";
import {
  StorageUsageError,
  type StorageUsageInput,
  type StorageUsageResult,
} from "@t3tools/contracts";
import type { StorageTreeNode } from "./storageUsageTree.ts";

export interface StorageUsageSnapshot extends StorageUsageResult {
  readonly nodes?: ReadonlyArray<StorageTreeNode>;
}

export function createStorageUsageCache(scan: () => Promise<StorageUsageSnapshot>) {
  let snapshot: StorageUsageSnapshot | undefined;
  let pending: Promise<StorageUsageSnapshot> | undefined;
  let groupSearch = new Map<string, string[]>();
  return async (input: StorageUsageInput): Promise<StorageUsageResult> => {
    const navigating = input.directoryId !== undefined || input.groupId !== undefined;
    if (
      (!snapshot && input.snapshotId) ||
      (navigating && (!snapshot || !input.snapshotId || input.refresh))
    )
      throw new StorageUsageError({
        detail: "Storage snapshot changed. Refresh the overview before opening an item.",
        reason: "stale-snapshot",
      });
    if (pending) await pending;
    else if (!snapshot || input.refresh) {
      pending = scan()
        .then((result) => {
          snapshot = { ...result, snapshotId: NodeCrypto.randomUUID() };
          groupSearch = new Map();
          for (const history of result.histories) {
            if (!history.groupId) continue;
            const values = groupSearch.get(history.groupId) ?? [];
            values.push(history.filePath, history.provider);
            groupSearch.set(history.groupId, values);
          }
          return snapshot;
        })
        .finally(() => {
          pending = undefined;
        });
      await pending;
    }
    const current = snapshot!;
    if (
      input.snapshotId &&
      input.snapshotId !== current.snapshotId &&
      (!input.refresh || navigating)
    )
      throw new StorageUsageError({
        detail: "Storage snapshot changed. Refresh the overview before opening an item.",
        reason: "stale-snapshot",
      });
    const {
      nodes = [],
      histories: allHistories,
      groups: allGroups = [],
      directory: _directory,
      ...base
    } = current;
    const search = input.search.trim().toLocaleLowerCase();
    const matches = (values: ReadonlyArray<string>) =>
      values.some((value) => value.toLocaleLowerCase().includes(search));
    const page = <T>(entries: ReadonlyArray<T>) =>
      entries.slice(input.offset, input.offset + input.limit);
    if (input.groupId && !allGroups.some((group) => group.id === input.groupId))
      throw new StorageUsageError({
        detail: "That conversation group is not part of this storage snapshot.",
        reason: "invalid-selection",
      });
    const view = input.view ?? "histories";
    if (view === "directory") {
      const byId = new Map(nodes.map((node) => [node.entry.id, node]));
      const selected = input.directoryId ? byId.get(input.directoryId) : undefined;
      if (input.directoryId && (!selected || selected.entry.kind !== "directory"))
        throw new StorageUsageError({
          detail: "That folder is not part of this storage snapshot.",
          reason: "invalid-selection",
        });
      const entries = nodes
        .filter(
          (node) =>
            node.parentId === (selected?.entry.id ?? null) &&
            matches([node.entry.name, node.entry.path]),
        )
        .map((node) => node.entry)
        .sort((a, b) => b.logicalBytes - a.logicalBytes || a.path.localeCompare(b.path));
      const breadcrumbs = [];
      let ancestor = selected;
      while (ancestor) {
        breadcrumbs.unshift(ancestor.entry);
        ancestor = ancestor.parentId ? byId.get(ancestor.parentId) : undefined;
      }
      return {
        ...base,
        histories: [],
        groups: [],
        directory: {
          current: selected?.entry ?? null,
          breadcrumbs,
          entries: page(entries),
          totalEntries: entries.length,
        },
      };
    }
    if (view === "groups") {
      const groups = allGroups.filter((group) =>
        matches([
          group.label,
          ...group.threads.flatMap((thread) => [thread.title, thread.projectName]),
          ...(groupSearch.get(group.id) ?? []),
        ]),
      );
      return {
        ...base,
        histories: [],
        groups: page(groups),
        totalGroups: allGroups.length,
        matchedGroups: groups.length,
      };
    }
    const histories = allHistories.filter(
      (history) =>
        (!input.groupId || history.groupId === input.groupId) &&
        matches([
          history.filePath,
          history.provider,
          ...history.threads.flatMap((thread) => [thread.title, thread.projectName]),
        ]),
    );
    return { ...base, histories: page(histories), groups: [], matchedHistories: histories.length };
  };
}
