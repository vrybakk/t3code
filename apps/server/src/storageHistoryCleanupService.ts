// @effect-diagnostics nodeBuiltinImport:off -- Configured homes are re-resolved before destructive operations.
import * as NodeFSP from "node:fs/promises";
import * as NodeCrypto from "node:crypto";
import { Effect, Path, Schema } from "effect";
import {
  StorageCleanupError,
  type StorageCleanupReviewInput,
  type StorageCleanupExecuteInput,
  type ServerSettings,
} from "@t3tools/contracts";
import { HostProcessEnvironment, HostProcessPlatform } from "@t3tools/shared/hostProcess";
import { ProviderService } from "./provider/Services/ProviderService.ts";
import { ProviderSessionDirectory } from "./provider/Services/ProviderSessionDirectory.ts";
import { ServerSettingsService } from "./serverSettings.ts";
import { resolveProviderStorageHomes } from "./project/providerStorageHomes.ts";
import { createStorageHistoryCleanup } from "./storageHistoryCleanup.ts";
import { storageNativeSessionId } from "./storageUsageLinks.ts";
import { resolvedStorageNativeSessions } from "./storageHistoryCleanupSafety.ts";
import { isHistoryTrashSupported, moveHistoryToTrash } from "./storageHistoryTrash.ts";
import { withProviderHistoryCleanup } from "./provider/historyAdmission.ts";
import type { createStorageUsageCache } from "./storageUsageCache.ts";

const isCleanupError = Schema.is(StorageCleanupError);
export const storageCleanupConfigurationKey = (settings: ServerSettings) =>
  NodeCrypto.createHash("sha256")
    .update(
      JSON.stringify({
        providerInstances: settings.providerInstances,
        providers: settings.providers,
      }),
    )
    .digest("hex");
const cleanupError = (cause: unknown) =>
  isCleanupError(cause)
    ? cause
    : new StorageCleanupError({
        detail:
          "Cleanup could not verify provider activity or filesystem safety. No further files were removed.",
        reason: "failed",
      });

export const makeStorageHistoryCleanupService = Effect.fn("makeStorageHistoryCleanupService")(
  function* (cache: ReturnType<typeof createStorageUsageCache>) {
    const provider = yield* ProviderService;
    const directory = yield* ProviderSessionDirectory;
    const settings = yield* ServerSettingsService;
    const environment = yield* HostProcessEnvironment;
    const platform = yield* HostProcessPlatform;
    const run = Effect.runPromiseWith(yield* Effect.context<Path.Path>());
    const roots = Effect.gen(function* () {
      const currentSettings = yield* settings.getSettings;
      if (
        cache.getSnapshot()?.cleanupConfiguration !==
        storageCleanupConfigurationKey(currentSettings)
      )
        return yield* new StorageCleanupError({
          detail: "Provider configuration changed. Refresh storage and review cleanup again.",
          reason: "stale-snapshot",
        });
      const homes = yield* resolveProviderStorageHomes(currentSettings, environment);
      return yield* Effect.promise(async () =>
        (
          await Promise.all(
            homes.map(async (home) => {
              try {
                return await NodeFSP.realpath(home.homePath);
              } catch (cause) {
                if (cause instanceof Error && "code" in cause && cause.code === "ENOENT")
                  return null;
                throw cause;
              }
            }),
          )
        ).filter((path): path is string => path !== null),
      );
    });
    const protection = Effect.gen(function* () {
      const [bindings, sessions] = yield* Effect.all([
        directory.listBindings(),
        provider.listSessions(),
      ]);
      const threadIds = new Set<string>();
      const nativeSessionKeys = new Set<string>();
      const unknownInstanceIds = new Set<string>();
      const resolvedNativeSessions = resolvedStorageNativeSessions(cache.getSnapshot());
      const active = [
        ...bindings.filter(
          (binding) => binding.status === "running" || binding.status === "starting",
        ),
        ...sessions.filter((session) => session.status !== "closed"),
      ];
      for (const session of active) {
        threadIds.add(session.threadId);
        if (session.provider !== "codex" && session.provider !== "claudeAgent") continue;
        const nativeId = storageNativeSessionId(session.provider, session.resumeCursor);
        if (!session.providerInstanceId || !nativeId)
          unknownInstanceIds.add(session.providerInstanceId ?? "*");
        else {
          const key = `${session.provider}:${session.providerInstanceId}:${nativeId}`;
          nativeSessionKeys.add(key);
          if (!resolvedNativeSessions.has(key)) unknownInstanceIds.add(session.providerInstanceId);
        }
      }
      return { threadIds, nativeSessionKeys, unknownInstanceIds };
    });
    const cleanup = createStorageHistoryCleanup({
      getSnapshot: cache.getSnapshot,
      invalidate: cache.invalidate,
      getRoots: () => run(roots),
      getProtection: () => run(protection),
      trashSupported: isHistoryTrashSupported(platform),
      trash: (path) => moveHistoryToTrash(path, platform),
    });
    return {
      reviewCleanup: (input: StorageCleanupReviewInput) =>
        Effect.tryPromise({ try: () => cleanup.review(input), catch: cleanupError }),
      executeCleanup: (input: StorageCleanupExecuteInput) =>
        withProviderHistoryCleanup(
          Effect.tryPromise({ try: () => cleanup.execute(input), catch: cleanupError }).pipe(
            Effect.uninterruptible,
          ),
        ),
    };
  },
);
