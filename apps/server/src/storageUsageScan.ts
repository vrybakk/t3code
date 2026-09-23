// @effect-diagnostics nodeBuiltinImport:off -- Native stat.blocks and O_NOFOLLOW are needed for allocated bytes and bounded safe header reads.
import * as NodeFSP from "node:fs/promises";
import * as NodePath from "node:path";
import * as NodeFS from "node:fs";
import { Schema, Option } from "effect";
import type { StorageHistory, StorageUsageCategory, StorageUsageTotals } from "@t3tools/contracts";

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
}
export interface StorageScan {
  readonly categories: StorageUsageCategory[];
  readonly histories: ScannedHistory[];
  readonly totals: StorageUsageTotals;
  readonly warnings: string[];
  readonly truncated: boolean;
}
const nativeCodexHeader = Schema.Struct({
  type: Schema.Literal("session_meta"),
  payload: Schema.Struct({ id: Schema.String }),
});
const nativeClaudeHeader = Schema.Struct({ sessionId: Schema.String });
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

async function readSessionId(
  filePath: string,
  provider: StorageHistory["provider"],
  bytes: number,
) {
  // O_NOFOLLOW closes the final-component race between lstat and opening a transcript.
  const handle = await NodeFSP.open(
    filePath,
    NodeFS.constants.O_RDONLY | NodeFS.constants.O_NOFOLLOW,
  );
  try {
    const buffer = Buffer.alloc(bytes);
    const { bytesRead } = await handle.read(buffer, 0, bytes, 0);
    const lines = buffer.subarray(0, bytesRead).toString("utf8").split("\n");
    for (const line of lines) {
      let value: unknown;
      try {
        value = JSON.parse(line);
      } catch {
        continue;
      }
      if (provider === "codex") {
        const decoded = Schema.decodeUnknownOption(nativeCodexHeader)(value);
        if (Option.isSome(decoded)) return decoded.value.payload.id;
      } else {
        const decoded = Schema.decodeUnknownOption(nativeClaudeHeader)(value);
        if (Option.isSome(decoded)) return decoded.value.sessionId;
      }
    }
    return undefined;
  } finally {
    await handle.close();
  }
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
  const canonicalRoots = new Map<string, StorageRoot>();
  let operations = 0;
  let files = 0;
  let headerBytes = 0;
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
    const visit = async (filePath: string): Promise<void> => {
      if (!withinBudget()) return;
      operations++;
      try {
        const stat = await NodeFSP.lstat(filePath);
        if (stat.isSymbolicLink()) {
          warnings.add(
            "Nested symbolic links are not followed; linked external data is outside this scan.",
          );
          return;
        }
        const identity =
          Number.isSafeInteger(stat.ino) && stat.ino > 0 ? `${stat.dev}:${stat.ino}` : filePath;
        if (seen.has(identity)) {
          const index = historyIndexes.get(identity);
          const history = index === undefined ? undefined : histories[index];
          if (index !== undefined && history?.provider === root.provider) {
            histories[index] = {
              ...history,
              instanceIds: [...new Set([...history.instanceIds, ...root.instanceIds])],
            };
          }
          return;
        }
        seen.add(identity);
        if (stat.isDirectory()) {
          if (!withinBudget()) return;
          operations++;
          const directory = await NodeFSP.opendir(filePath);
          for await (const entry of directory) {
            if (!withinBudget()) break;
            await visit(NodePath.join(filePath, entry.name));
          }
          return;
        }
        if (!stat.isFile()) return;
        files++;
        const allocatedBytes =
          Number.isFinite(stat.blocks) && stat.blocks >= 0 ? stat.blocks * 512 : null;
        const totals = { logicalBytes: stat.size, allocatedBytes, fileCount: 1 };
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
          let sessionId: string | undefined;
          if (withinBudget() && headerBytes < limits.totalHeaderBytes) {
            operations++;
            const bytes = Math.min(
              stat.size,
              limits.headerBytes,
              limits.totalHeaderBytes - headerBytes,
            );
            headerBytes += bytes;
            try {
              sessionId = await readSessionId(filePath, root.provider, bytes);
            } catch {
              warnings.add(
                "Some transcript headers could not be read; their sizes are included but links may be unavailable.",
              );
            }
          }
          if (!sessionId)
            warnings.add(
              "Some histories have unavailable or oversized native headers, or the header-read budget was reached. Their sizes are included, but thread links may be incomplete.",
            );
          historyIndexes.set(identity, histories.length);
          histories.push({
            filePath,
            provider: root.provider,
            logicalBytes: stat.size,
            allocatedBytes,
            modifiedAt: stat.mtime.toISOString(),
            archived: relative.split(NodePath.sep)[0] === "archived_sessions",
            threads: [],
            sessionId,
            instanceIds: root.instanceIds,
            device: stat.dev,
            inode: stat.ino,
            birthtimeMs: stat.birthtimeMs,
          });
        }
      } catch {
        warnings.add(`Some entries could not be read under ${root.path}; totals are partial.`);
        truncated = true;
      }
    };
    await visit(root.path);
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
  };
}
