// @effect-diagnostics nodeBuiltinImport:off -- All destructive cases use dedicated mkdtemp fixtures only.
import * as NodeFSP from "node:fs/promises";
import * as NodePath from "node:path";
import * as NodeOS from "node:os";
import { afterEach } from "vite-plus/test";
import { createStorageHistoryCleanup } from "../storageHistoryCleanup.ts";
import { scanStorageRoots } from "../storageUsageScan.ts";
import { groupStorageHistories } from "../storageUsageGroups.ts";
import { createStorageHistoryLinker } from "../storageUsageLinks.ts";
import type { StorageUsageSnapshot } from "../storageUsageCache.ts";

const directories: string[] = [];
afterEach(async () => {
  for (const path of directories.splice(0))
    await NodeFSP.rm(path, { recursive: true, force: true });
});
export async function cleanupFixture(
  options: {
    parent?: string;
    invalid?: boolean;
    hardlink?: boolean;
    trashSupported?: boolean;
    family?: boolean;
    trash?: (path: string) => Promise<void>;
  } = {},
) {
  const root = await NodeFSP.realpath(
    await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "t3-native-cleanup-")),
  );
  directories.push(root);
  await NodeFSP.mkdir(NodePath.join(root, "sessions"));
  const file = NodePath.join(root, "sessions", "test.jsonl");
  await NodeFSP.writeFile(
    file,
    options.invalid
      ? "unreadable metadata\n"
      : JSON.stringify({
          type: "session_meta",
          payload: {
            id: "native-one",
            ...(options.parent
              ? { source: { subagent: { thread_spawn: { parent_thread_id: options.parent } } } }
              : {}),
          },
        }) + "\n",
  );
  if (options.hardlink) await NodeFSP.link(file, NodePath.join(root, "sessions", "alias.jsonl"));
  if (options.family) {
    for (const [id, parent] of [
      ["parent", "grandparent"],
      ["grandparent", undefined],
    ])
      await NodeFSP.writeFile(
        NodePath.join(root, "sessions", `${id}.jsonl`),
        JSON.stringify({
          type: "session_meta",
          payload: {
            id,
            ...(parent
              ? {
                  source: { subagent: { thread_spawn: { parent_thread_id: parent } } },
                }
              : {}),
          },
        }) + "\n",
      );
  }
  const scan = await scanStorageRoots([{ path: root, provider: "codex", instanceIds: ["codex"] }]);
  const grouped = groupStorageHistories(scan.histories, createStorageHistoryLinker([], [], []));
  let snapshot: StorageUsageSnapshot | undefined = {
    ...scan,
    ...grouped,
    cleanupFiles: scan.histories.map((entry, index) => ({ ...entry, ...grouped.histories[index] })),
    snapshotId: "snapshot",
    scannedAt: "2026-09-23T00:00:00.000Z",
    scanDurationMs: 1,
    totalHistories: scan.histories.length,
    matchedHistories: scan.histories.length,
  };
  const nativeSessionKeys = new Set<string>();
  const threadIds = new Set<string>();
  const unknownInstanceIds = new Set<string>();
  let timestamp = 1000;
  let trashCalls = 0;
  let failTrash = false;
  const cleanup = createStorageHistoryCleanup({
    getSnapshot: () => snapshot,
    invalidate: () => {
      snapshot = undefined;
    },
    getRoots: async () => [root],
    getProtection: async () => ({ nativeSessionKeys, threadIds, unknownInstanceIds }),
    trashSupported: options.trashSupported ?? true,
    trash: async (path) => {
      trashCalls++;
      if (failTrash) throw new Error("trash unavailable");
      if (options.trash) return options.trash(path);
      await NodeFSP.rename(path, NodePath.join(root, "trashed.jsonl"));
    },
    now: () => timestamp,
  });
  const identity = await NodeFSP.stat(file);
  const reviewInput = {
    snapshotId: "snapshot",
    historyIds: [
      scan.histories.find((entry) => entry.device === identity.dev && entry.inode === identity.ino)!
        .id!,
    ],
    groupIds: [],
  };
  const executeInput = (planId: string) => ({
    planId,
    mode: "trash" as const,
    acknowledgeExternalSessionsStopped: true,
    acknowledgeHistoryLoss: true,
    confirmPermanentDelete: false,
  });
  return {
    root,
    file,
    cleanup,
    reviewInput,
    executeInput,
    nativeSessionKeys,
    threadIds,
    unknownInstanceIds,
    snapshot,
    advance: (milliseconds: number) => {
      timestamp += milliseconds;
    },
    expire: () => {
      timestamp += 600001;
    },
    replaceSnapshot: (value: StorageUsageSnapshot | undefined) => {
      snapshot = value;
    },
    trashCalls: () => trashCalls,
    failTrash: () => {
      failTrash = true;
    },
  };
}
