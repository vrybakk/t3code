import { describe, expect } from "vite-plus/test";
import { it } from "@effect/vitest";
import { Effect, Path } from "effect";
import {
  DEFAULT_SERVER_SETTINGS,
  ProviderInstanceId,
  ProviderDriverKind,
  type ServerSettings,
} from "@t3tools/contracts";
import { ProviderService } from "./provider/Services/ProviderService.ts";
import { ProviderSessionDirectory } from "./provider/Services/ProviderSessionDirectory.ts";
import { ServerSettingsService } from "./serverSettings.ts";
import { createStorageUsageCache, type StorageUsageSnapshot } from "./storageUsageCache.ts";
import {
  makeStorageHistoryCleanupService,
  storageCleanupConfigurationKey,
} from "./storageHistoryCleanupService.ts";
import { resolvedStorageNativeSessions } from "./storageHistoryCleanupSafety.ts";
import type { ScannedHistory } from "./storageUsageScan.ts";

const history: ScannedHistory = {
  id: "file",
  filePath: "/account/sessions/file.jsonl",
  provider: "codex",
  logicalBytes: 100,
  allocatedBytes: 512,
  modifiedAt: "2026-09-23T00:00:00.000Z",
  archived: false,
  threads: [],
  sessionId: "native",
  instanceIds: ["codex"],
  homePath: "/account",
  device: 1,
  inode: 1,
  birthtimeMs: 0,
  modifiedMs: 0,
  changedMs: 0,
  linkCount: 1,
  groupId: "group",
  relationship: "direct",
};
const snapshot: StorageUsageSnapshot = {
  scannedAt: "2026-09-23T00:00:00.000Z",
  scanDurationMs: 1,
  totals: { logicalBytes: 100, allocatedBytes: 512, fileCount: 1 },
  categories: [],
  histories: [],
  cleanupFiles: [history],
  totalHistories: 1,
  matchedHistories: 1,
  warnings: [],
  truncated: false,
  cleanupConfiguration: storageCleanupConfigurationKey(DEFAULT_SERVER_SETTINGS),
};

describe("cleanup activity and configuration protection", () => {
  it("only accounts for native active IDs whose full ancestry was resolved", () => {
    expect(resolvedStorageNativeSessions(snapshot).has("codex:codex:native")).toBe(true);
    expect(resolvedStorageNativeSessions(snapshot).has("codex:codex:new-session")).toBe(false);
    for (const change of [{ relationship: "unlinked" as const }, { metadataConflict: true }])
      expect(
        resolvedStorageNativeSessions({ ...snapshot, cleanupFiles: [{ ...history, ...change }] })
          .size,
      ).toBe(0);
    expect(
      resolvedStorageNativeSessions({
        ...snapshot,
        cleanupFiles: [history, { ...history, metadataConflict: true }],
      }).size,
    ).toBe(0);
  });

  it.effect("rejects fresh provider configuration changes before filesystem cleanup", () =>
    Effect.gen(function* () {
      let settings: ServerSettings = DEFAULT_SERVER_SETTINGS;
      const cache = createStorageUsageCache(async () => snapshot);
      const report = yield* Effect.promise(() =>
        cache({ refresh: false, offset: 0, limit: 25, search: "" }),
      );
      const service = yield* makeStorageHistoryCleanupService(cache).pipe(
        Effect.provideService(ProviderService, {
          listSessions: () => Effect.succeed([]),
        } as unknown as typeof ProviderService.Service),
        Effect.provideService(ProviderSessionDirectory, {
          listBindings: () => Effect.succeed([]),
        } as unknown as typeof ProviderSessionDirectory.Service),
        Effect.provideService(ServerSettingsService, {
          getSettings: Effect.sync(() => settings),
        } as unknown as typeof ServerSettingsService.Service),
        Effect.provide(Path.layer),
      );
      settings = {
        ...settings,
        providerInstances: {
          [ProviderInstanceId.make("another")]: {
            driver: ProviderDriverKind.make("codex"),
            displayName: "Another account",
          },
        },
      };
      expect(storageCleanupConfigurationKey(settings)).not.toBe(snapshot.cleanupConfiguration);
      const result = yield* service
        .reviewCleanup({ snapshotId: report.snapshotId!, historyIds: ["file"], groupIds: [] })
        .pipe(Effect.flip);
      expect(result).toMatchObject({
        reason: "stale-snapshot",
        detail: expect.stringContaining("configuration changed"),
      });
    }),
  );
});
