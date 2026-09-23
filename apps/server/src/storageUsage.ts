import { Context, DateTime, Effect, Layer, Path, Schema } from "effect";
import {
  StorageUsageError,
  type StorageUsageInput,
  type StorageUsageResult,
  StorageCleanupError,
  type StorageCleanupReviewInput,
  type StorageCleanupReviewResult,
  type StorageCleanupExecuteInput,
  type StorageCleanupExecuteResult,
} from "@t3tools/contracts";
import { HostProcessEnvironment } from "@t3tools/shared/hostProcess";
import { ServerConfig } from "./config.ts";
import { ServerSettingsService } from "./serverSettings.ts";
import { ProviderSessionDirectory } from "./provider/Services/ProviderSessionDirectory.ts";
import { ProjectionSnapshotQuery } from "./orchestration/Services/ProjectionSnapshotQuery.ts";
import { resolveProviderStorageHomes } from "./project/providerStorageHomes.ts";
import { scanStorageRoots } from "./storageUsageScan.ts";
import { createStorageHistoryLinker } from "./storageUsageLinks.ts";
import { createStorageUsageCache } from "./storageUsageCache.ts";
import { groupStorageHistories } from "./storageUsageGroups.ts";
import {
  makeStorageHistoryCleanupService,
  storageCleanupConfigurationKey,
} from "./storageHistoryCleanupService.ts";
const isStorageUsageError = Schema.is(StorageUsageError);

export class StorageUsage extends Context.Service<
  StorageUsage,
  {
    readonly getUsage: (
      input: StorageUsageInput,
    ) => Effect.Effect<StorageUsageResult, StorageUsageError>;
    readonly reviewCleanup: (
      input: StorageCleanupReviewInput,
    ) => Effect.Effect<StorageCleanupReviewResult, StorageCleanupError>;
    readonly executeCleanup: (
      input: StorageCleanupExecuteInput,
    ) => Effect.Effect<StorageCleanupExecuteResult, StorageCleanupError>;
  }
>()("t3/storageUsage") {
  static readonly make = Effect.gen(function* () {
    const config = yield* ServerConfig;
    const settings = yield* ServerSettingsService;
    const directory = yield* ProviderSessionDirectory;
    const projection = yield* ProjectionSnapshotQuery;
    const environment = yield* HostProcessEnvironment;
    const scan = Effect.gen(function* () {
      const started = performance.now();
      const currentSettings = yield* settings.getSettings;
      const homes = yield* resolveProviderStorageHomes(currentSettings, environment);
      const result = yield* Effect.promise(() =>
        scanStorageRoots([
          ...homes.map((home) => ({
            path: home.homePath,
            provider: home.provider,
            instanceIds: home.instanceIds,
          })),
          { path: config.baseDir, provider: "t3", instanceIds: [] },
        ]),
      );
      const metadata = yield* Effect.all([
        directory.listBindings(),
        projection.getShellSnapshot(),
        projection.getArchivedShellSnapshot(),
      ]).pipe(Effect.option);
      let link = createStorageHistoryLinker([], [], []);
      if (metadata._tag === "Some") {
        const [bindings, active, archived] = metadata.value;
        const projectIds = [
          ...new Set([...active.projects, ...archived.projects].map((project) => project.id)),
        ];
        const imported = yield* Effect.forEach(
          projectIds,
          (id) => projection.getImportedAgentSessionSources(id),
          { concurrency: 4 },
        ).pipe(Effect.option);
        if (imported._tag === "None")
          result.warnings.push(
            "Imported thread links are unavailable; filesystem sizes remain accurate within the scan scope.",
          );
        link = createStorageHistoryLinker(
          [active, archived],
          bindings,
          imported._tag === "Some" ? imported.value.flat() : [],
        );
      } else
        result.warnings.push(
          "Thread metadata is unavailable; filesystem sizes remain accurate within the scan scope.",
        );
      const { histories, groups, unresolvedAncestry } = groupStorageHistories(
        result.histories,
        link,
      );
      if (unresolvedAncestry)
        result.warnings.push(
          "Some native parent relationships conflict, form cycles, or exceed the ancestry limit. Those histories remain separate instead of guessing their conversation.",
        );
      return {
        ...result,
        histories,
        cleanupFiles: result.histories.map((file, index) => ({ ...file, ...histories[index] })),
        cleanupConfiguration: storageCleanupConfigurationKey(currentSettings),
        groups,
        totalGroups: groups.length,
        matchedGroups: groups.length,
        scannedAt: DateTime.formatIso(yield* DateTime.now),
        scanDurationMs: Math.round(performance.now() - started),
        totalHistories: histories.length,
        matchedHistories: histories.length,
      };
    });
    const runScan = Effect.runPromiseWith(yield* Effect.context<Path.Path>());
    const getCachedUsage = createStorageUsageCache(() => runScan(scan));
    const cleanup = yield* makeStorageHistoryCleanupService(getCachedUsage);
    const getUsage = (input: StorageUsageInput) =>
      Effect.tryPromise({
        try: () => getCachedUsage(input),
        catch: (cause) =>
          isStorageUsageError(cause)
            ? cause
            : new StorageUsageError({
                reason: "scan-failed",
                detail:
                  "Could not inspect storage. Check access to the configured provider homes and try again.",
              }),
      });
    return StorageUsage.of({ getUsage, ...cleanup });
  });
  static readonly layer = Layer.effect(StorageUsage, StorageUsage.make);
}

export const make = StorageUsage.make;
export const layer = StorageUsage.layer;
