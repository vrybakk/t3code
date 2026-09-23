import type { EnvironmentId, StorageUsageResult } from "@t3tools/contracts";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import { useEffect, useRef, useState } from "react";

import { storageUsageGet } from "../../state/storageUsage";
import { useAtomCommand } from "../../state/use-atom-command";
import { Button } from "../ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { SettingsSection } from "./settingsLayout";
import { useSettingsScope } from "./SettingsScopeContext";
import { StorageUsageHistories } from "./StorageUsageHistories";
import { formatStorageBytes, STORAGE_HISTORY_PAGE_SIZE } from "./StorageUsage.logic";

export function StorageUsagePanel() {
  const { scope, connectedEnvironments } = useSettingsScope();
  const environment =
    scope.environmentIds.length === 1
      ? connectedEnvironments.find((entry) => entry.environmentId === scope.environmentIds[0])
      : undefined;
  const message =
    scope.environmentIds.length !== 1
      ? "Choose one machine in the settings scope to inspect its storage. Storage is never combined across machines."
      : !environment
        ? "Reconnect this machine to inspect its storage."
        : environment.serverConfig?.environment.capabilities.storageUsage !== true
          ? "Update this machine's server to inspect its storage usage."
          : null;
  return (
    <SettingsSection id="storage-usage" title="Storage usage" variant="plain">
      {message || !environment ? (
        <p className="px-3 text-sm text-muted-foreground sm:px-4" role="status">
          {message}
        </p>
      ) : (
        <StorageUsageDashboard
          key={environment.environmentId}
          environmentId={environment.environmentId}
          label={environment.label}
        />
      )}
    </SettingsSection>
  );
}

export function StorageUsageDashboard({
  environmentId,
  label,
}: {
  environmentId: EnvironmentId;
  label: string;
}) {
  const getUsage = useAtomCommand(storageUsageGet, { reportFailure: false });
  const [page, setPage] = useState<{
    result: StorageUsageResult;
    search: string;
    offset: number;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);
  useEffect(
    () => () => {
      requestId.current += 1;
    },
    [],
  );

  async function load(refresh: boolean, search = "", offset = 0) {
    const id = ++requestId.current;
    setLoading(true);
    setError(null);
    const response = await getUsage({
      environmentId,
      input: { refresh, search, offset, limit: STORAGE_HISTORY_PAGE_SIZE },
    });
    if (id !== requestId.current) return;
    setLoading(false);
    if (response._tag === "Success") {
      if (offset > 0 && response.value.histories.length === 0) {
        void load(false, search, 0);
        return;
      }
      setPage({ result: response.value, search, offset });
    } else if (!isAtomCommandInterrupted(response)) {
      const failure = squashAtomCommandFailure(response);
      setError(
        failure instanceof Error ? failure.message : "Storage scan failed. Try scanning again.",
      );
    }
  }

  const result = page?.result;
  const largestCategory = Math.max(
    1,
    ...(result?.categories.map((category) => category.logicalBytes) ?? []),
  );
  return (
    <div className="space-y-6 px-3 sm:px-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-xl space-y-1">
          <h3 className="text-sm font-medium">{label}</h3>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Machine-wide storage, including all projects. Scans known Codex, Claude Code and T3
            locations, not your whole disk. Other providers and worktrees outside T3 storage are not
            included.
          </p>
        </div>
        <Button size="xs" variant="outline" disabled={loading} onClick={() => void load(true)}>
          {loading ? "Loading…" : result ? "Rescan storage" : "Scan storage"}
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div role="status" aria-live="polite" className="text-xs text-muted-foreground">
        {loading
          ? "Reading storage on this machine. Existing files will not be changed."
          : !result
            ? "Start a read-only scan to see what is taking up space. Large directories can take a moment."
            : `Scanned ${new Date(result.scannedAt).toLocaleString()} in ${(result.scanDurationMs / 1_000).toFixed(1)}s`}
      </div>
      {result && (
        <>
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <dt className="text-xs text-muted-foreground">File sizes</dt>
              <dd className="mt-1 text-3xl font-medium tracking-tight tabular-nums">
                {formatStorageBytes(result.totals.logicalBytes)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Allocated on disk</dt>
              <dd className="mt-1 text-3xl font-medium tracking-tight tabular-nums">
                {formatStorageBytes(result.totals.allocatedBytes)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Files scanned</dt>
              <dd className="mt-1 text-3xl font-medium tracking-tight tabular-nums">
                {result.totals.fileCount.toLocaleString()}
              </dd>
            </div>
          </dl>
          <p className="max-w-2xl text-xs leading-relaxed text-muted-foreground">
            File sizes are logical bytes; allocated space is filesystem-reported disk usage.
            Compression, sparse files and APFS clones can differ. Neither total guarantees how much
            deleting files would free. Sizes use binary units (1 GiB = 1,024 MiB).
          </p>
          {(result.truncated || result.warnings.length > 0) && (
            <div
              role="status"
              className="space-y-1 rounded-lg border border-warning/30 bg-warning/5 p-3 text-xs text-muted-foreground"
            >
              {result.truncated && (
                <p className="font-medium text-warning">
                  Partial scan: some files could not be measured. These totals do not include every
                  file.
                </p>
              )}
              {[...new Set(result.warnings)].map((warning) => (
                <p key={warning}>{warning}</p>
              ))}
            </div>
          )}
          <div className="space-y-4">
            <h3 className="text-sm font-medium">Storage breakdown</h3>
            {result.categories.map((category) => (
              <div key={category.id} className="space-y-1.5">
                <div className="flex min-w-0 items-center justify-between gap-3 text-xs">
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <span
                          tabIndex={0}
                          className="truncate outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        />
                      }
                    >
                      {category.label}
                    </TooltipTrigger>
                    <TooltipPopup className="max-w-sm break-all">{category.rootPath}</TooltipPopup>
                  </Tooltip>
                  <span className="shrink-0 tabular-nums">
                    {formatStorageBytes(category.logicalBytes)}
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                  <div
                    className="h-full rounded-full bg-foreground/60"
                    style={{ width: `${(category.logicalBytes / largestCategory) * 100}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  {category.fileCount.toLocaleString()} files ·{" "}
                  {formatStorageBytes(category.allocatedBytes)} on disk
                </p>
              </div>
            ))}
          </div>
          {page && (
            <StorageUsageHistories
              key={`${result.scannedAt}:${page.search}`}
              result={result}
              search={page.search}
              offset={page.offset}
              loading={loading}
              onPage={(search, offset) => void load(false, search, offset)}
            />
          )}
          <p className="max-w-2xl text-xs leading-relaxed text-muted-foreground">
            Provider histories may also be used by Codex, Claude Code or another T3 installation.
            Unmatched and deleted-chat histories are not automatically safe to remove. This view is
            read-only; existing cleanup rules below do not delete provider histories.
          </p>
        </>
      )}
    </div>
  );
}
