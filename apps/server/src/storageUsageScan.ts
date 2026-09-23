// @effect-diagnostics nodeBuiltinImport:off -- Native stat.blocks and O_NOFOLLOW are needed for allocated bytes and bounded safe header reads.
import * as NodeFSP from "node:fs/promises";
import * as NodePath from "node:path";
import type { StorageHistory, StorageUsageCategory, StorageUsageTotals } from "@t3tools/contracts";
import { readStorageMetadata } from "./storageUsageMetadata.ts";
import { createStorageTree, type StorageTreeNode } from "./storageUsageTree.ts";

export interface StorageRoot {
  readonly path: string;
  readonly provider: "t3" | "codex" | "claudeAgent";
  readonly instanceIds: ReadonlyArray<string>;
}
export interface ScannedHistory extends StorageHistory {
  readonly sessionId: string | undefined;
  readonly instanceIds: ReadonlyArray<string>;
  readonly device: number;
  readonly inode: number;
  readonly birthtimeMs: number;
  readonly homePath: string;
  readonly homePaths?: ReadonlyArray<string>;
  readonly parentSessionId?: string | undefined;
  readonly metadataConflict?: boolean;
}
export interface StorageScan {
  readonly categories: StorageUsageCategory[];
  readonly histories: ScannedHistory[];
  readonly totals: StorageUsageTotals;
  readonly warnings: string[];
  readonly truncated: boolean;
  readonly nodes: StorageTreeNode[];
}
const emptyTotals = (): StorageUsageTotals => ({
  logicalBytes: 0,
  allocatedBytes: 0,
  fileCount: 0,
});

export function addStorageTotals(
  left: StorageUsageTotals,
  right: StorageUsageTotals,
): StorageUsageTotals {
  return {
    logicalBytes: left.logicalBytes + right.logicalBytes,
    allocatedBytes:
      left.allocatedBytes === null || right.allocatedBytes === null
        ? null
        : left.allocatedBytes + right.allocatedBytes,
    fileCount: left.fileCount + right.fileCount,
  };
}

function classify(provider: StorageRoot["provider"], relative: string) {
  const parts = relative.split(NodePath.sep);
  const name = NodePath.basename(relative);
  if (parts.includes("worktrees")) return "Worktrees";
  if (provider === "codex" && ["sessions", "archived_sessions"].includes(parts[0] ?? ""))
    return "Histories";
  if (provider === "claudeAgent" && parts[0] === "projects" && name.endsWith(".jsonl"))
    return "Histories";
  if (/\.(?:sqlite|db)(?:-(?:wal|shm))?$/.test(name) || parts.includes("sqlite"))
    return "Databases";
  if (parts.includes("attachments")) return "Attachments";
  if (parts.includes("browser-artifacts")) return "Browser artifacts";
  if (parts.some((part) => ["log", "logs", "debug"].includes(part)) || name.endsWith(".log"))
    return "Logs";
  if (parts.some((part) => /^(?:cache|caches|tmp)$/.test(part))) return "Caches";
  return "Other";
}

export async function scanStorageRoots(
  roots: ReadonlyArray<StorageRoot>,
  limits = {
    operations: 150_000,
    files: 100_000,
    durationMs: 20_000,
    headerBytes: 131_072,
    totalHeaderBytes: 67_108_864,
  },
): Promise<StorageScan> {
  const started = performance.now();
  const categories = new Map<string, StorageUsageCategory>();
  const histories: ScannedHistory[] = [];
  const warnings = new Set<string>();
  const seen = new Set<string>();
  const historyIndexes = new Map<string, number>();
  const tree = createStorageTree(100_000);
  const canonicalRoots = new Map<string, StorageRoot>();
  let operations = 0;
  let files = 0;
  let truncated = false;
  const withinBudget = () => {
    const allowed =
      operations < limits.operations &&
      files < limits.files &&
      performance.now() - started < limits.durationMs;
    if (!allowed) {
      truncated = true;
      warnings.add(
        "Scan limit reached. Totals are partial; narrow the configured storage roots or scan again when the disk is less busy.",
      );
    }
    return allowed;
  };
  for (const root of roots) {
    if (!withinBudget()) break;
    operations++;
    try {
      const path = await NodeFSP.realpath(root.path);
      const previous = canonicalRoots.get(path);
      canonicalRoots.set(path, {
        ...(previous ?? root),
        path,
        instanceIds: [...new Set([...(previous?.instanceIds ?? []), ...root.instanceIds])],
      });
    } catch (cause) {
      if (!(cause instanceof Error && "code" in cause && cause.code === "ENOENT")) {
        warnings.add(`Cannot inspect storage root: ${root.path}`);
        truncated = true;
      }
    }
  }
  // Specific roots own files before broader overlapping roots, so provider histories retain attribution.
  for (const root of [...canonicalRoots.values()].sort(
    (a, b) => b.path.length - a.path.length || a.path.localeCompare(b.path),
  )) {
    const visit = async (filePath: string, parentId: string | null): Promise<void> => {
      if (!withinBudget()) return;
      operations++;
      let nodeId: string | undefined;
      try {
        const stat = await NodeFSP.lstat(filePath);
        if (stat.isSymbolicLink()) {
          tree.add(filePath, parentId, "symlink", "skipped");
          warnings.add(
            "Nested symbolic links are not followed; linked external data is outside this scan.",
          );
          return;
        }
        const identity =
          Number.isSafeInteger(stat.ino) && stat.ino > 0 ? `${stat.dev}:${stat.ino}` : filePath;
        if (seen.has(identity)) {
          tree.add(filePath, parentId, stat.isDirectory() ? "directory" : "file", "shared");
          const index = historyIndexes.get(identity);
          const history = index === undefined ? undefined : histories[index];
          if (index !== undefined && history?.provider === root.provider) {
            histories[index] = {
              ...history,
              instanceIds: [...new Set([...history.instanceIds, ...root.instanceIds])],
              homePaths: [...new Set([...(history.homePaths ?? [history.homePath]), root.path])],
            };
          }
          return;
        }
        seen.add(identity);
        if (stat.isDirectory()) {
          nodeId = tree.add(filePath, parentId, "directory");
          if (!nodeId) {
            truncated = true;
            return;
          }
          if (!withinBudget()) {
            tree.mark(nodeId, "partial");
            return;
          }
          operations++;
          const directory = await NodeFSP.opendir(filePath);
          for await (const entry of directory) {
            if (!withinBudget()) {
              tree.mark(nodeId, "partial");
              break;
            }
            await visit(NodePath.join(filePath, entry.name), nodeId);
          }
          return;
        }
        if (!stat.isFile()) {
          tree.add(filePath, parentId, "unmeasured", "skipped");
          return;
        }
        nodeId = tree.add(filePath, parentId, "file");
        if (!nodeId) {
          truncated = true;
          return;
        }
        files++;
        const allocatedBytes =
          Number.isFinite(stat.blocks) && stat.blocks >= 0 ? stat.blocks * 512 : null;
        const totals = { logicalBytes: stat.size, allocatedBytes, fileCount: 1 };
        tree.update(nodeId, totals);
        const relative = NodePath.relative(root.path, filePath);
        const category = classify(root.provider, relative);
        const id = `${root.provider}:${root.path}:${category}`;
        const previous = categories.get(id);
        categories.set(id, {
          id,
          label: `${root.provider === "t3" ? "T3" : root.provider === "codex" ? "Codex" : "Claude"} · ${category}`,
          rootPath: root.path,
          ...addStorageTotals(previous ?? emptyTotals(), totals),
        });
        if (category === "Histories" && root.provider !== "t3" && filePath.endsWith(".jsonl")) {
          historyIndexes.set(identity, histories.length);
          histories.push({
            filePath,
            provider: root.provider,
            logicalBytes: stat.size,
            allocatedBytes,
            modifiedAt: stat.mtime.toISOString(),
            archived: relative.split(NodePath.sep)[0] === "archived_sessions",
            threads: [],
            sessionId: undefined,
            instanceIds: root.instanceIds,
            device: stat.dev,
            inode: stat.ino,
            birthtimeMs: stat.birthtimeMs,
            homePath: root.path,
          });
        }
      } catch {
        nodeId ??= tree.add(filePath, parentId, "unmeasured", "partial");
        tree.mark(nodeId ?? parentId ?? undefined, "partial");
        warnings.add(`Some entries could not be read under ${root.path}; totals are partial.`);
        truncated = true;
      }
    };
    await visit(root.path, null);
  }
  await readStorageMetadata(histories, limits, () => {
    if (operations >= limits.operations || performance.now() - started >= limits.durationMs)
      return false;
    operations++;
    return true;
  });
  if (histories.some((history) => !history.sessionId))
    warnings.add(
      "Some native headers could not be read within the metadata budget. Sizes are measured, but conversation grouping is incomplete.",
    );
  const { nodes, truncated: treeTruncated } = tree.finish();
  if (treeTruncated) {
    truncated = true;
    warnings.add("Directory snapshot limit reached; sizes and directory contents are partial.");
  }
  const sortedCategories = [...categories.values()].sort(
    (a, b) => b.logicalBytes - a.logicalBytes || a.id.localeCompare(b.id),
  );
  histories.sort((a, b) => b.logicalBytes - a.logicalBytes || a.filePath.localeCompare(b.filePath));
  return {
    categories: sortedCategories,
    histories,
    totals: sortedCategories.reduce(addStorageTotals, emptyTotals()),
    warnings: [...warnings],
    truncated,
    nodes,
  };
}
