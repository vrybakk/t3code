import { Option, Schema } from "effect";
import type {
  AgentSessionImportSource,
  OrchestrationShellSnapshot,
  StorageThreadLink,
  ThreadId,
} from "@t3tools/contracts";
import type { ProviderRuntimeBindingWithMetadata } from "./provider/Services/ProviderSessionDirectory.ts";
import type { ScannedHistory } from "./storageUsageScan.ts";

const codexCursor = Schema.Struct({ threadId: Schema.String });
const claudeCursor = Schema.Struct({
  resume: Schema.optional(Schema.String),
  sessionId: Schema.optional(Schema.String),
});
const decodeCodexCursor = Schema.decodeUnknownOption(codexCursor);
const decodeClaudeCursor = Schema.decodeUnknownOption(claudeCursor);

export function storageNativeSessionId(provider: string, cursor: unknown): string | undefined {
  if (provider === "codex") {
    const decoded = decodeCodexCursor(cursor);
    return Option.isSome(decoded) ? decoded.value.threadId : undefined;
  }
  if (provider === "claudeAgent") {
    const decoded = decodeClaudeCursor(cursor);
    return Option.isSome(decoded) ? (decoded.value.resume ?? decoded.value.sessionId) : undefined;
  }
  return undefined;
}

export function createStorageHistoryLinker(
  shells: ReadonlyArray<OrchestrationShellSnapshot>,
  bindings: ReadonlyArray<ProviderRuntimeBindingWithMetadata>,
  imports: ReadonlyArray<{
    readonly threadId: ThreadId;
    readonly source: AgentSessionImportSource;
  }>,
) {
  const projects = new Map(
    shells.flatMap((shell) =>
      shell.projects.map((project) => [project.id, project.title] as const),
    ),
  );
  const threads = new Map(
    shells.flatMap((shell) => shell.threads.map((thread) => [thread.id, thread] as const)),
  );
  const byIdentity = new Map<string, Set<ThreadId>>();
  const bySession = new Map<string, Set<ThreadId>>();
  const add = (map: Map<string, Set<ThreadId>>, key: string, threadId: ThreadId) => {
    const ids = map.get(key) ?? new Set<ThreadId>();
    ids.add(threadId);
    map.set(key, ids);
  };
  for (const entry of imports) {
    if (
      entry.source.inode !== null &&
      Number.isSafeInteger(entry.source.inode) &&
      entry.source.inode > 0 &&
      entry.source.birthtimeMs !== null
    ) {
      add(
        byIdentity,
        `${entry.source.provider}:${entry.source.device}:${entry.source.inode}:${entry.source.birthtimeMs}`,
        entry.threadId,
      );
    }
    add(
      bySession,
      `${entry.source.provider}:${entry.source.providerInstanceId}:${entry.source.providerSessionId}`,
      entry.threadId,
    );
  }
  for (const binding of bindings) {
    if (!binding.providerInstanceId) continue;
    const id = storageNativeSessionId(binding.provider, binding.resumeCursor);
    if (id)
      add(bySession, `${binding.provider}:${binding.providerInstanceId}:${id}`, binding.threadId);
  }
  return (histories: ReadonlyArray<ScannedHistory>) =>
    histories.map(
      ({
        sessionId,
        instanceIds,
        device,
        inode,
        birthtimeMs,
        homePath: _homePath,
        homePaths: _homePaths,
        parentSessionId: _parentSessionId,
        metadataConflict: _metadataConflict,
        modifiedMs: _modifiedMs,
        changedMs: _changedMs,
        linkCount: _linkCount,
        ...history
      }) => {
        const linkedIds = new Set(
          byIdentity.get(`${history.provider}:${device}:${inode}:${birthtimeMs}`),
        );
        if (sessionId)
          for (const instanceId of instanceIds) {
            for (const id of bySession.get(`${history.provider}:${instanceId}:${sessionId}`) ?? [])
              linkedIds.add(id);
          }
        const links: StorageThreadLink[] = [...linkedIds].map((id) => {
          const thread = threads.get(id);
          return {
            threadId: id,
            title: thread?.title ?? `Thread ${id}`,
            projectName: thread
              ? (projects.get(thread.projectId) ?? "Unknown project")
              : "Unavailable thread metadata",
            status: thread?.archivedAt
              ? "archived"
              : thread?.latestTurn?.state === "running"
                ? "active"
                : "linked",
          };
        });
        return { ...history, threads: links };
      },
    );
}

export function linkStorageHistories(
  histories: ReadonlyArray<ScannedHistory>,
  ...metadata: Parameters<typeof createStorageHistoryLinker>
) {
  return createStorageHistoryLinker(...metadata)(histories);
}
