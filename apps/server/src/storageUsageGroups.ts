import * as NodeCrypto from "node:crypto";
import type { StorageHistory, StorageHistoryGroup, StorageThreadLink } from "@t3tools/contracts";
import { addStorageTotals, type ScannedHistory } from "./storageUsageScan.ts";

export function groupStorageHistories(
  raw: ReadonlyArray<ScannedHistory>,
  link: (histories: ReadonlyArray<ScannedHistory>) => StorageHistory[],
) {
  const linked = link(raw);
  const bySession = new Map<string, ScannedHistory[]>();
  const key = (history: ScannedHistory, homePath: string, sessionId: string) =>
    `${history.provider}\0${homePath}\0${sessionId}`;
  for (const history of raw) {
    if (!history.sessionId) continue;
    for (const homePath of history.homePaths ?? [history.homePath]) {
      const id = key(history, homePath, history.sessionId);
      bySession.set(id, [...(bySession.get(id) ?? []), history]);
    }
  }
  interface Resolution {
    key: string;
    sessionId: string | undefined;
    missing: boolean;
    unresolved: boolean;
    rootHistory?: ScannedHistory;
  }
  const resolved = new Map<string, Resolution>();
  const resolve = (history: ScannedHistory, homePath: string): Resolution => {
    if (!history.sessionId)
      return { key: history.filePath, sessionId: undefined, missing: false, unresolved: true };
    let sessionId = history.sessionId;
    const seen = new Set<string>();
    const finish = (result: Resolution) => {
      if (!result.unresolved) for (const id of seen) resolved.set(id, result);
      return result;
    };
    while (true) {
      const id = key(history, homePath, sessionId);
      const cached = resolved.get(id);
      if (cached) return finish(cached);
      if (seen.has(id) || seen.size >= 256)
        return { key: history.filePath, sessionId: undefined, missing: false, unresolved: true };
      seen.add(id);
      const candidates = bySession.get(id);
      if (!candidates) return finish({ key: id, sessionId, missing: true, unresolved: false });
      const parents = new Set(candidates.map((candidate) => candidate.parentSessionId));
      if (candidates.some((candidate) => candidate.metadataConflict) || parents.size !== 1)
        return { key: history.filePath, sessionId: undefined, missing: false, unresolved: true };
      const parent = parents.values().next().value;
      if (!parent)
        return finish({
          key: `${history.provider}\0${candidates[0]!.filePath}`,
          sessionId,
          missing: false,
          unresolved: false,
          rootHistory: candidates[0]!,
        });
      sessionId = parent;
    }
  };
  const groups = new Map<string, StorageHistoryGroup>();
  const rootLinks = new Map<string, ReadonlyArray<StorageThreadLink>>();
  const histories: StorageHistory[] = [];
  let unresolvedAncestry = false;
  for (const [index, history] of raw.entries()) {
    const roots = (history.homePaths ?? [history.homePath]).map((homePath) =>
      resolve(history, homePath),
    );
    const first = roots[0]!;
    const root = roots.every((candidate) => candidate.key === first.key)
      ? first
      : { key: history.filePath, sessionId: undefined, missing: false, unresolved: true };
    unresolvedAncestry ||= root.unresolved && history.sessionId !== undefined;
    const own = linked[index]!;
    const rootHistory = "rootHistory" in root ? root.rootHistory : undefined;
    const parentLinks =
      rootLinks.get(root.key) ??
      (root.sessionId
        ? link([
            {
              ...(rootHistory ?? history),
              sessionId: root.sessionId,
              device: rootHistory?.device ?? -1,
              inode: rootHistory?.inode ?? 0,
              birthtimeMs: rootHistory?.birthtimeMs ?? 0,
            },
          ])[0]!.threads
        : []);
    rootLinks.set(root.key, parentLinks);
    const links = new Map<string, StorageThreadLink>(
      [...parentLinks, ...own.threads].map((thread) => [thread.threadId, thread]),
    );
    const existing = groups.get(root.key);
    const groupId = existing?.id ?? NodeCrypto.randomUUID();
    const subagent = !root.unresolved && root.sessionId !== history.sessionId;
    const groupLinks = new Map<string, StorageThreadLink>(
      [...(existing?.threads ?? []), ...links.values()].map((thread) => [thread.threadId, thread]),
    );
    groups.set(root.key, {
      id: groupId,
      label:
        parentLinks[0]?.title ??
        own.threads[0]?.title ??
        existing?.label ??
        (history.sessionId
          ? root.unresolved
            ? "Unresolved ancestry"
            : `${history.provider === "codex" ? "Codex" : "Claude"} session ${root.sessionId?.slice(0, 8)}`
          : "Metadata unavailable"),
      threads: [...groupLinks.values()],
      ...addStorageTotals(existing ?? { logicalBytes: 0, allocatedBytes: 0, fileCount: 0 }, {
        logicalBytes: history.logicalBytes,
        allocatedBytes: history.allocatedBytes,
        fileCount: 1,
      }),
      subagentCount: (existing?.subagentCount ?? 0) + (subagent ? 1 : 0),
      parentMissing: root.missing,
    });
    histories.push({
      ...own,
      groupId,
      relationship: subagent ? "subagent" : root.unresolved ? "unlinked" : "direct",
      threads: [...links.values()],
    });
  }
  return {
    histories,
    groups: [...groups.values()].sort(
      (a, b) => b.logicalBytes - a.logicalBytes || a.label.localeCompare(b.label),
    ),
    unresolvedAncestry,
  };
}
