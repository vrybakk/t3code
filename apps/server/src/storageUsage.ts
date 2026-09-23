import { Context, DateTime, Effect, Layer, Path } from "effect";
import {
  StorageUsageError,
  type StorageUsageInput,
  type StorageUsageResult,
} from "@t3tools/contracts";
import { HostProcessEnvironment } from "@t3tools/shared/hostProcess";
import { ServerConfig } from "./config.ts";
import { ServerSettingsService } from "./serverSettings.ts";
import { ProviderSessionDirectory } from "./provider/Services/ProviderSessionDirectory.ts";
import { ProjectionSnapshotQuery } from "./orchestration/Services/ProjectionSnapshotQuery.ts";
import { resolveProviderStorageHomes } from "./project/providerStorageHomes.ts";
import { scanStorageRoots } from "./storageUsageScan.ts";
import { linkStorageHistories } from "./storageUsageLinks.ts";
import { createStorageUsageCache } from "./storageUsageCache.ts";

export class StorageUsage extends Context.Service<
  StorageUsage,
  {
    readonly getUsage: (
      input: StorageUsageInput,
    ) => Effect.Effect<StorageUsageResult, StorageUsageError>;
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
      const homes = yield* resolveProviderStorageHomes(yield* settings.getSettings, environment);
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
      let histories: StorageUsageResult["histories"] = linkStorageHistories(
        result.histories,
        [],
        [],
        [],
      );
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
        histories = linkStorageHistories(
          result.histories,
          [active, archived],
          bindings,
          imported._tag === "Some" ? imported.value.flat() : [],
        );
      } else
        result.warnings.push(
          "Thread metadata is unavailable; filesystem sizes remain accurate within the scan scope.",
        );
      return {
        ...result,
        histories,
        scannedAt: DateTime.formatIso(yield* DateTime.now),
        scanDurationMs: Math.round(performance.now() - started),
        totalHistories: histories.length,
        matchedHistories: histories.length,
      } satisfies StorageUsageResult;
    });
    const runScan = Effect.runPromiseWith(yield* Effect.context<Path.Path>());
    const getCachedUsage = createStorageUsageCache(() => runScan(scan));
    const getUsage = (input: StorageUsageInput) =>
      Effect.tryPromise({
        try: () => getCachedUsage(input),
        catch: () =>
          new StorageUsageError({
            detail:
              "Could not inspect storage. Check access to the configured provider homes and try again.",
          }),
      });
    return StorageUsage.of({ getUsage });
  });
  static readonly layer = Layer.effect(StorageUsage, StorageUsage.make);
}

export const make = StorageUsage.make;
export const layer = StorageUsage.layer;
