// @effect-diagnostics nodeBuiltinImport:off -- Snapshot paths are display-only native filesystem paths.
import * as NodePath from "node:path";
import * as NodeCrypto from "node:crypto";
import type { StorageDirectoryEntry, StorageUsageTotals } from "@t3tools/contracts";

export interface StorageTreeNode {
  readonly entry: StorageDirectoryEntry;
  readonly parentId: string | null;
}

export function createStorageTree(maxNodes: number) {
  const nodes = new Map<string, StorageTreeNode>();
  let truncated = false;
  const add = (
    path: string,
    parentId: string | null,
    kind: StorageDirectoryEntry["kind"],
    status: StorageDirectoryEntry["status"] = "measured",
  ) => {
    if (nodes.size >= maxNodes) {
      truncated = true;
      mark(parentId ?? undefined, "partial");
      return undefined;
    }
    const id = NodeCrypto.randomUUID();
    const entry: StorageDirectoryEntry = {
      id,
      name: NodePath.basename(path) || path,
      path,
      kind,
      status,
      logicalBytes: 0,
      allocatedBytes: 0,
      fileCount: 0,
    };
    nodes.set(id, { entry, parentId });
    return id;
  };
  const update = (id: string | undefined, totals: StorageUsageTotals) => {
    let current = id;
    while (current) {
      const node = nodes.get(current);
      if (!node) break;
      nodes.set(current, {
        ...node,
        entry: {
          ...node.entry,
          logicalBytes: node.entry.logicalBytes + totals.logicalBytes,
          allocatedBytes:
            node.entry.allocatedBytes === null || totals.allocatedBytes === null
              ? null
              : node.entry.allocatedBytes + totals.allocatedBytes,
          fileCount: node.entry.fileCount + totals.fileCount,
        },
      });
      current = node.parentId ?? undefined;
    }
  };
  const mark = (id: string | undefined, status: StorageDirectoryEntry["status"]) => {
    let current = id;
    while (current) {
      const node = nodes.get(current);
      if (!node) return;
      nodes.set(current, {
        ...node,
        entry: { ...node.entry, status: current === id ? status : "partial" },
      });
      if (status !== "partial") return;
      current = node.parentId ?? undefined;
    }
  };
  return { add, update, mark, finish: () => ({ nodes: [...nodes.values()], truncated }) };
}
