// @effect-diagnostics nodeBuiltinImport:off -- Real temporary files verify cached metadata reads and directory accounting.
import * as NodeFSP from "node:fs/promises";
import * as NodePath from "node:path";
import * as NodeOS from "node:os";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { scanStorageRoots, type ScannedHistory } from "./storageUsageScan.ts";
import { readStorageMetadata } from "./storageUsageMetadata.ts";
import { createStorageUsageCache } from "./storageUsageCache.ts";
import { createStorageHistoryLinker } from "./storageUsageLinks.ts";
import { groupStorageHistories } from "./storageUsageGroups.ts";
import { createStorageTree } from "./storageUsageTree.ts";

const directories: string[] = [];
afterEach(async () => {
  for (const path of directories.splice(0))
    await NodeFSP.rm(path, { recursive: true, force: true });
});
async function fixture() {
  const path = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "t3-storage-drilldown-"));
  directories.push(path);
  return path;
}
const input = { refresh: false, search: "", offset: 0, limit: 1 };

describe("bounded storage metadata and directory snapshots", () => {
  it("charges actual small reads and fairly schedules each provider/home before oversized histories", async () => {
    const path = await fixture();
    const entries: ScannedHistory[] = [];
    for (let index = 0; index < 3; index++) {
      const filePath = NodePath.join(path, `${index}.jsonl`);
      const provider = index === 1 ? "claudeAgent" : "codex";
      const content =
        index === 0
          ? JSON.stringify({
              type: "session_meta",
              payload: { id: "big", padding: "x".repeat(20000) },
            })
          : index === 1
            ? JSON.stringify({ sessionId: "claude" })
            : JSON.stringify({
                type: "session_meta",
                payload: {
                  id: "small",
                  source: { subagent: { thread_spawn: { parent_thread_id: "parent" } } },
                },
              });
      await NodeFSP.writeFile(filePath, content + "\n");
      entries.push({
        filePath,
        provider,
        logicalBytes: content.length + 1,
        allocatedBytes: 512,
        modifiedAt: "2026-09-23T00:00:00.000Z",
        archived: false,
        threads: [],
        sessionId: undefined,
        instanceIds: [String(index)],
        device: 1,
        inode: 0,
        birthtimeMs: 0,
        homePath: String(index),
        modifiedMs: 0,
        changedMs: 0,
        linkCount: 1,
      });
    }
    const result = await readStorageMetadata(
      entries,
      { headerBytes: 131072, totalHeaderBytes: 8192 },
      () => true,
    );
    expect(entries.map((entry) => entry.sessionId)).toEqual([undefined, "claude", "small"]);
    expect(entries[2]?.parentSessionId).toBe("parent");
    expect(result.bytesReadTotal).toBe(8192);
    await readStorageMetadata(
      entries,
      { headerBytes: 131072, totalHeaderBytes: 65536 },
      () => true,
    );
    expect(entries[0]?.sessionId).toBe("big");
  });

  it("caches paged folders and conversation members without leaking full trees or rescanning", async () => {
    const path = await fixture();
    await NodeFSP.mkdir(NodePath.join(path, "sessions"));
    for (const id of ["parent", "child"])
      await NodeFSP.writeFile(
        NodePath.join(path, "sessions", `${id}.jsonl`),
        JSON.stringify({
          type: "session_meta",
          payload: {
            id,
            ...(id === "child"
              ? { source: { subAgent: { thread_spawn: { parent_thread_id: "parent" } } } }
              : {}),
          },
        }) + "\n",
      );
    await NodeFSP.symlink("/does-not-exist", NodePath.join(path, "skipped-link"));
    let scans = 0;
    const cache = createStorageUsageCache(async () => {
      scans++;
      const scan = await scanStorageRoots([{ path, provider: "codex", instanceIds: ["codex"] }]);
      const grouped = groupStorageHistories(scan.histories, createStorageHistoryLinker([], [], []));
      return {
        ...scan,
        ...grouped,
        cleanupFiles: scan.histories,
        cleanupConfiguration: "private-configuration-fingerprint",
        scannedAt: "2026-09-23T00:00:00.000Z",
        scanDurationMs: 1,
        totalHistories: scan.histories.length,
        matchedHistories: scan.histories.length,
      };
    });
    await expect(
      cache({ ...input, directoryId: "invented", snapshotId: "old", view: "directory" }),
    ).rejects.toMatchObject({ reason: "stale-snapshot" });
    expect(scans).toBe(0);
    const roots = await cache({ ...input, view: "directory" });
    expect(roots).not.toHaveProperty("nodes");
    expect(roots).not.toHaveProperty("cleanupFiles");
    expect(roots).not.toHaveProperty("cleanupConfiguration");
    expect(roots.histories).toEqual([]);
    const root = roots.directory!.entries[0]!;
    expect(root.logicalBytes).toBe(roots.totals.logicalBytes);
    const folder = await cache({
      ...input,
      snapshotId: roots.snapshotId!,
      directoryId: root.id,
      view: "directory",
    });
    expect(folder.directory?.totalEntries).toBe(2);
    expect(folder.directory?.entries).toHaveLength(1);
    const second = await cache({
      ...input,
      snapshotId: roots.snapshotId!,
      directoryId: root.id,
      view: "directory",
      offset: 1,
    });
    expect(second.directory?.entries[0]).toMatchObject({ kind: "symlink", status: "skipped" });
    const groups = await cache({ ...input, view: "groups", search: "child.jsonl" });
    expect(groups).not.toHaveProperty("cleanupFiles");
    expect(groups).not.toHaveProperty("cleanupConfiguration");
    expect(groups.groups).toHaveLength(1);
    expect(groups.groups?.[0]?.fileCount).toBe(2);
    const members = await cache({
      ...input,
      snapshotId: roots.snapshotId!,
      view: "histories",
      groupId: groups.groups![0]!.id,
    });
    expect(members.histories).toHaveLength(1);
    expect(members).not.toHaveProperty("cleanupFiles");
    expect(members).not.toHaveProperty("cleanupConfiguration");
    expect(members.matchedHistories).toBe(2);
    await expect(
      cache({ ...input, snapshotId: roots.snapshotId!, directoryId: "/etc", view: "directory" }),
    ).rejects.toMatchObject({ reason: "invalid-selection" });
    await expect(
      cache({
        ...input,
        refresh: true,
        snapshotId: roots.snapshotId!,
        directoryId: root.id,
        view: "directory",
      }),
    ).rejects.toMatchObject({ reason: "stale-snapshot" });
    expect(scans).toBe(1);
    await cache({ ...input, refresh: true });
    await expect(
      cache({ ...input, snapshotId: roots.snapshotId!, directoryId: root.id, view: "directory" }),
    ).rejects.toMatchObject({ reason: "stale-snapshot" });
    expect(scans).toBe(2);
  });

  it("marks every containing folder partial when the node cap drops an entry", () => {
    const tree = createStorageTree(2);
    const root = tree.add("/root", null, "directory")!;
    const child = tree.add("/root/folder", root, "directory")!;
    expect(tree.finish().nodes.every((node) => node.entry.status === "measured")).toBe(true);
    expect(tree.add("/root/folder/omitted", child, "file")).toBeUndefined();
    expect(tree.finish()).toMatchObject({ truncated: true });
    expect(tree.finish().nodes).toHaveLength(2);
    expect(tree.finish().nodes.every((node) => node.entry.status === "partial")).toBe(true);
  });

  it("propagates unmeasured descendants to their parents", () => {
    const tree = createStorageTree(2);
    const root = tree.add("/root", null, "directory")!;
    const child = tree.add("/root/denied", root, "unmeasured", "partial")!;
    tree.mark(child, "partial");
    expect(tree.finish().nodes.every((node) => node.entry.status === "partial")).toBe(true);
  });
});
