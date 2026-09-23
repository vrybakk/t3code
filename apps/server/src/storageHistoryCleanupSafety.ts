// @effect-diagnostics nodeBuiltinImport:off -- Cleanup validates native file identity and rejects symbolic links before touching an explicitly reviewed path.
import * as NodeFSP from "node:fs/promises";
import * as NodePath from "node:path";
import type { ScannedHistory } from "./storageUsageScan.ts";
import type { StorageUsageSnapshot } from "./storageUsageCache.ts";

export interface StorageCleanupProtection {
  readonly threadIds: ReadonlySet<string>;
  readonly nativeSessionKeys: ReadonlySet<string>;
  readonly unknownInstanceIds: ReadonlySet<string>;
}

export function resolvedStorageNativeSessions(snapshot: StorageUsageSnapshot | undefined) {
  const resolved = new Set<string>();
  const unresolved = new Set<string>();
  const missingParents = new Set(
    snapshot?.groups?.filter((group) => group.parentMissing).map((group) => group.id),
  );
  for (const file of snapshot?.cleanupFiles ?? []) {
    if (!file.sessionId) continue;
    const target =
      file.metadataConflict ||
      file.relationship === "unlinked" ||
      (file.groupId && missingParents.has(file.groupId))
        ? unresolved
        : resolved;
    for (const instance of file.instanceIds)
      target.add(`${file.provider}:${instance}:${file.sessionId}`);
  }
  for (const key of unresolved) resolved.delete(key);
  return resolved;
}

export function activeStorageGroups(
  files: ReadonlyArray<ScannedHistory>,
  protection: StorageCleanupProtection,
) {
  const active = new Set<string>();
  for (const file of files) {
    if (!file.groupId) continue;
    if (
      file.threads.some((thread) => protection.threadIds.has(thread.threadId)) ||
      file.instanceIds.some(
        (instance) =>
          protection.unknownInstanceIds.has(instance) ||
          [file.sessionId, file.parentSessionId].some(
            (id) => id && protection.nativeSessionKeys.has(`${file.provider}:${instance}:${id}`),
          ),
      )
    )
      active.add(file.groupId);
  }
  return active;
}

export async function validateHistoryForCleanup(
  file: ScannedHistory,
  roots: ReadonlyArray<string>,
  protection: StorageCleanupProtection,
  activeGroups: ReadonlySet<string>,
): Promise<string | null> {
  if (protection.unknownInstanceIds.has("*"))
    return "An open provider session has unknown account identity. Cleanup cannot verify safety.";
  if (!file.sessionId || file.metadataConflict || file.relationship === "unlinked")
    return "Native metadata or ancestry is incomplete. Refresh after resolving the scan warning.";
  if (file.linkCount !== 1 || !Number.isSafeInteger(file.inode) || file.inode <= 0)
    return "This file has shared or unavailable filesystem identity; cleanup is blocked.";
  if (
    (file.groupId && activeGroups.has(file.groupId)) ||
    file.threads.some((thread) => protection.threadIds.has(thread.threadId)) ||
    file.instanceIds.some(
      (instance) =>
        protection.unknownInstanceIds.has(instance) ||
        [file.sessionId, file.parentSessionId].some(
          (id) => id && protection.nativeSessionKeys.has(`${file.provider}:${instance}:${id}`),
        ),
    )
  )
    return "This history belongs to an open or recovering T3 provider session. Close that session first.";
  if (!roots.includes(file.homePath)) return "The provider home is no longer configured.";
  const relative = NodePath.relative(file.homePath, file.filePath);
  const parts = relative.split(NodePath.sep);
  if (
    !relative ||
    NodePath.isAbsolute(relative) ||
    parts.includes("..") ||
    !file.filePath.endsWith(".jsonl") ||
    !(file.provider === "codex"
      ? ["sessions", "archived_sessions"].includes(parts[0] ?? "")
      : parts[0] === "projects")
  )
    return "The file is outside the configured native history directories.";
  try {
    let path = file.homePath;
    for (const part of ["", ...parts.slice(0, -1)]) {
      path = NodePath.join(path, part);
      const directory = await NodeFSP.lstat(path);
      if (directory.isSymbolicLink() || !directory.isDirectory())
        return "A history directory changed or became a symbolic link.";
    }
    const stat = await NodeFSP.lstat(file.filePath);
    if (!stat.isFile() || stat.isSymbolicLink())
      return "The reviewed history is no longer a regular file.";
    if (
      stat.dev !== file.device ||
      stat.ino !== file.inode ||
      stat.birthtimeMs !== file.birthtimeMs ||
      stat.size !== file.logicalBytes ||
      stat.mtimeMs !== file.modifiedMs ||
      stat.ctimeMs !== file.changedMs ||
      stat.nlink !== 1
    )
      return "The history changed since it was scanned. Refresh and review it again.";
    return null;
  } catch {
    return "The history is missing or cannot be verified safely.";
  }
}
