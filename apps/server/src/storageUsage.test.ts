// @effect-diagnostics nodeBuiltinImport:off -- Fixtures exercise physical filesystem allocation, hardlinks and symlinks.
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { it as effectIt } from "@effect/vitest";
import { Effect, Layer } from "effect";
import * as NodeServices from "@effect/platform-node/NodeServices";
import {
  ProviderDriverKind,
  ProviderInstanceId,
  ThreadId,
  type StorageUsageResult,
} from "@t3tools/contracts";
import { scanStorageRoots } from "./storageUsageScan.ts";
import { linkStorageHistories } from "./storageUsageLinks.ts";
import { createStorageUsageCache } from "./storageUsageCache.ts";
import { resolveProviderStorageHomes } from "./project/providerStorageHomes.ts";
import { ServerSettingsService, layerTest } from "./serverSettings.ts";

const directories: string[] = [];
async function fixture() {
  const path = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "t3-storage-test-"));
  directories.push(path);
  return path;
}
afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((path) => NodeFSP.rm(path, { recursive: true, force: true })),
  );
});
const root = (path: string) => ({ path, provider: "codex" as const, instanceIds: ["codex"] });
async function history(path: string, name: string, id: string, payload = "") {
  await NodeFSP.mkdir(NodePath.join(path, "sessions"), { recursive: true });
  const file = NodePath.join(path, "sessions", name);
  await NodeFSP.writeFile(
    file,
    JSON.stringify({ type: "session_meta", payload: { id, payload } }) + "\n",
  );
  return file;
}

describe("storage scan", () => {
  effectIt.effect(
    "resolves disabled homes, overlays and per-instance environment without double counting roots",
    () =>
      Effect.gen(function* () {
        const path = yield* Effect.promise(fixture);
        const homes = yield* Effect.gen(function* () {
          const settings = yield* ServerSettingsService;
          return yield* resolveProviderStorageHomes(yield* settings.getSettings, {
            CODEX_HOME: NodePath.join(path, "host-codex"),
            CLAUDE_CONFIG_DIR: NodePath.join(path, "host-claude"),
          });
        }).pipe(
          Effect.provide(
            Layer.mergeAll(
              layerTest({
                providerInstances: {
                  [ProviderInstanceId.make("codex")]: {
                    driver: ProviderDriverKind.make("codex"),
                    enabled: false,
                    config: {},
                    environment: [
                      { name: "CODEX_HOME", value: NodePath.join(path, "instance-codex") },
                    ],
                  },
                  [ProviderInstanceId.make("overlay")]: {
                    driver: ProviderDriverKind.make("codex"),
                    config: {
                      homePath: NodePath.join(path, "shared"),
                      shadowHomePath: NodePath.join(path, "overlay"),
                    },
                  },
                  [ProviderInstanceId.make("claudeAgent")]: {
                    driver: ProviderDriverKind.make("claudeAgent"),
                    config: {},
                  },
                },
              }),
              NodeServices.layer,
            ),
          ),
        );
        expect(homes.map((home) => home.homePath).sort()).toEqual(
          ["instance-codex", "shared", "overlay", "host-claude"]
            .map((name) => NodePath.join(path, name))
            .sort(),
        );
      }),
  );
  it("counts whole roots once across root aliases, overlapping roots and hardlinks without following nested links", async () => {
    const path = await fixture();
    const file = await history(path, "a.jsonl", "session-a");
    await NodeFSP.mkdir(NodePath.join(path, "cache"));
    await NodeFSP.writeFile(NodePath.join(path, "cache", "cache.bin"), "cache");
    await NodeFSP.link(file, NodePath.join(path, "sessions", "duplicate.jsonl"));
    const outside = await fixture();
    await NodeFSP.writeFile(NodePath.join(outside, "excluded"), "x".repeat(1000));
    await NodeFSP.symlink(outside, NodePath.join(path, "external"));
    const alias = NodePath.join(outside, "alias");
    await NodeFSP.symlink(path, alias);
    const result = await scanStorageRoots(
      [root(path), root(alias), { path: NodePath.dirname(path), provider: "t3", instanceIds: [] }],
      {
        operations: 1,
        files: 100,
        durationMs: 20000,
        headerBytes: 131072,
        totalHeaderBytes: 67108864,
      },
    );
    expect(result.truncated).toBe(true);
    const exact = await scanStorageRoots([root(path), root(alias)]);
    expect(exact.totals.fileCount).toBe(2);
    expect(exact.totals.logicalBytes).toBe((await NodeFSP.stat(file)).size + 5);
    expect(exact.histories).toHaveLength(1);
    expect(exact.warnings.join(" ")).toContain("symbolic links");
  });

  it("separates sparse logical bytes from allocated bytes and includes archived histories", async () => {
    const path = await fixture();
    await NodeFSP.mkdir(NodePath.join(path, "archived_sessions"));
    const file = NodePath.join(path, "archived_sessions", "large.jsonl");
    await NodeFSP.writeFile(
      file,
      JSON.stringify({ type: "session_meta", payload: { id: "archived" } }) + "\n",
    );
    await NodeFSP.truncate(file, 8 * 1024 * 1024);
    const stat = await NodeFSP.stat(file);
    const result = await scanStorageRoots([root(path)]);
    expect(result.totals.logicalBytes).toBe(stat.size);
    expect(result.totals.allocatedBytes).toBe(stat.blocks * 512);
    expect(result.histories[0]?.archived).toBe(true);
    expect(result.histories[0]?.sessionId).toBe("archived");
  });

  it("keeps both account links for hardlinked histories while charging the bytes once", async () => {
    const first = await fixture();
    const second = await fixture();
    const file = await history(first, "shared.jsonl", "shared-session");
    await NodeFSP.mkdir(NodePath.join(second, "sessions"));
    await NodeFSP.link(file, NodePath.join(second, "sessions", "shared.jsonl"));
    const scan = await scanStorageRoots([
      root(first),
      { ...root(second), instanceIds: ["second"] },
    ]);
    expect(scan.totals.fileCount).toBe(1);
    expect(scan.histories[0]?.instanceIds.toSorted()).toEqual(["codex", "second"]);
  });

  it("bounds headers, warns for malformed or oversized metadata and caps traversal", async () => {
    const path = await fixture();
    await history(path, "valid.jsonl", "large-header", "x".repeat(20000));
    await NodeFSP.writeFile(NodePath.join(path, "sessions", "invalid.jsonl"), "not-json\n");
    const normal = await scanStorageRoots([root(path)]);
    expect(normal.histories.find((entry) => entry.sessionId === "large-header")).toBeDefined();
    expect(normal.warnings.join(" ")).toContain("headers");
    const bounded = await scanStorageRoots([root(path)], {
      operations: 100,
      files: 100,
      durationMs: 20000,
      headerBytes: 32,
      totalHeaderBytes: 32,
    });
    expect(bounded.histories.every((entry) => entry.sessionId === undefined)).toBe(true);
    expect(bounded.totals.logicalBytes).toBe(normal.totals.logicalBytes);
    const capped = await scanStorageRoots([root(path)], {
      operations: 3,
      files: 100,
      durationMs: 20000,
      headerBytes: 32,
      totalHeaderBytes: 32,
    });
    expect(capped.truncated).toBe(true);
  });

  it("links exact native identities, supports shared sessions and avoids cross-account guessing", async () => {
    const path = await fixture();
    await history(path, "a.jsonl", "native-a");
    const scanned = await scanStorageRoots([root(path)]);
    const binding = (id: string, instance = "codex") => ({
      threadId: ThreadId.make(id),
      provider: ProviderDriverKind.make("codex"),
      providerInstanceId: ProviderInstanceId.make(instance),
      resumeCursor: { threadId: "native-a" },
      lastSeenAt: "2026-09-23T00:00:00.000Z",
    });
    const linked = linkStorageHistories(
      scanned.histories,
      [],
      [binding("first"), binding("second"), binding("other-account", "different")],
      [],
    );
    expect(linked[0]?.threads.map((entry) => entry.threadId)).toEqual(["first", "second"]);
    expect(linked[0]).not.toHaveProperty("sessionId");
    expect(linked[0]).not.toHaveProperty("inode");
    expect(linked[0]?.threads.every((entry) => entry.status === "linked")).toBe(true);
  });

  it("does not attribute a replacement file to an old imported path", async () => {
    const path = await fixture();
    const filePath = await history(path, "a.jsonl", "new-session");
    const scan = await scanStorageRoots([root(path)]);
    const stat = await NodeFSP.stat(filePath);
    const source = {
      provider: "codex" as const,
      providerInstanceId: ProviderInstanceId.make("codex"),
      providerSessionId: "old-session",
      filePath,
      size: stat.size,
      mtimeMs: stat.mtimeMs,
      device: stat.dev,
      inode: stat.ino + 1,
      birthtimeMs: stat.birthtimeMs,
    };
    const imported = { threadId: ThreadId.make("imported"), source };
    expect(linkStorageHistories(scan.histories, [], [], [imported])[0]?.threads).toEqual([]);
    expect(
      linkStorageHistories(
        scan.histories.map((entry) => ({ ...entry, inode: 0 })),
        [],
        [],
        [{ ...imported, source: { ...source, inode: 0 } }],
      )[0]?.threads,
    ).toEqual([]);
    expect(
      linkStorageHistories(
        scan.histories,
        [],
        [],
        [{ ...imported, source: { ...source, inode: stat.ino } }],
      )[0]?.threads.map((entry) => entry.threadId),
    ).toEqual(["imported"]);
  });

  it("caches a stable sorted snapshot across searches and pages and singleflights refreshes", async () => {
    const path = await fixture();
    await history(path, "a.jsonl", "a");
    await history(path, "b.jsonl", "b", "bigger");
    let scans = 0;
    const cached = createStorageUsageCache(async () => {
      scans++;
      const scan = await scanStorageRoots([root(path)]);
      return {
        ...scan,
        histories: linkStorageHistories(scan.histories, [], [], []),
        scannedAt: "2026-09-23T00:00:00.000Z",
        scanDurationMs: 1,
        totalHistories: scan.histories.length,
        matchedHistories: scan.histories.length,
      } satisfies StorageUsageResult;
    });
    const input = { refresh: false, search: "", offset: 0, limit: 1 };
    const [first, same] = await Promise.all([cached(input), cached(input)]);
    expect(scans).toBe(1);
    expect(first).toEqual(same);
    expect(first.histories[0]?.filePath).toContain("b.jsonl");
    const next = await cached({ ...input, offset: 1 });
    expect(next.histories[0]?.filePath).toContain("a.jsonl");
    expect((await cached({ ...input, search: "a.jsonl" })).matchedHistories).toBe(1);
    expect(scans).toBe(1);
    await Promise.all([cached({ ...input, refresh: true }), cached({ ...input, refresh: true })]);
    expect(scans).toBe(2);
  });
});
