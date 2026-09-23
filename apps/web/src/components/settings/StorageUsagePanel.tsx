import type { EnvironmentId, StorageHistoryGroup } from "@t3tools/contracts";
import { useState } from "react";
import { Button } from "../ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { SettingsSection } from "./settingsLayout";
import { useSettingsScope } from "./SettingsScopeContext";
import { StorageUsageHistories } from "./StorageUsageHistories";
import { formatStorageBytes } from "./StorageUsage.logic";
import { initialStorageQuery, useStorageUsage } from "./StorageUsageState";
import { StorageUsageGroups } from "./StorageUsageGroups";
import { StorageUsageDirectory } from "./StorageUsageDirectory";

export function StorageUsagePanel({
  section = "histories",
}: {
  section?: "overview" | "breakdown" | "histories";
}) {
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
          section={section}
        />
      )}
    </SettingsSection>
  );
}

export function StorageUsageDashboard({
  environmentId,
  label,
  section,
}: {
  environmentId: EnvironmentId;
  label: string;
  section: "overview" | "breakdown" | "histories";
}) {
  const { historyPage: page, directoryPage, loading, error, load } = useStorageUsage(environmentId);
  const [expanded, setExpanded] = useState<StorageHistoryGroup | null>(null);
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
        <Button
          size="xs"
          variant="outline"
          disabled={loading}
          onClick={() => {
            setExpanded(null);
            void load(true);
          }}
        >
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
          ? "Loading storage results. Existing files will not be changed."
          : !result
            ? "Start a read-only scan to see what is taking up space. Large directories can take a moment."
            : `Scanned ${new Date(result.scannedAt).toLocaleString()} in ${(result.scanDurationMs / 1_000).toFixed(1)}s`}
      </div>
      {result && (
        <>
          <div hidden={section !== "overview"} className="space-y-6">
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
              Compression, sparse files and APFS clones can differ. Neither total guarantees how
              much deleting files would free. Sizes use binary units (1 GiB = 1,024 MiB).
            </p>
          </div>
          <div hidden={section !== "breakdown"} className="space-y-6">
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
                      <TooltipPopup className="max-w-sm break-all">
                        {category.rootPath}
                      </TooltipPopup>
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
            {directoryPage?.result.directory ? (
              <StorageUsageDirectory
                key={`${directoryPage.result.snapshotId}:${directoryPage.query.directoryId}:${directoryPage.query.search}`}
                directory={directoryPage.result.directory}
                search={directoryPage.query.search}
                offset={directoryPage.query.offset}
                loading={loading}
                onPage={(search, offset) =>
                  void load(false, { ...directoryPage.query, search, offset })
                }
                onOpen={(directoryId) =>
                  void load(false, {
                    view: "directory",
                    search: "",
                    offset: 0,
                    ...(directoryId ? { directoryId } : {}),
                  })
                }
              />
            ) : result.snapshotId ? (
              <Button
                size="xs"
                variant="outline"
                disabled={loading}
                onClick={() => void load(false, { view: "directory", search: "", offset: 0 })}
              >
                Browse folders
              </Button>
            ) : (
              <p className="text-xs text-muted-foreground">
                Update this machine's server to browse scanned folders.
              </p>
            )}
          </div>
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
          <div hidden={section !== "histories"} className="space-y-6">
            {page?.query.groupId && (
              <div className="space-y-2">
                <Button
                  size="xs"
                  variant="outline"
                  disabled={loading}
                  onClick={() => {
                    setExpanded(null);
                    void load(false, initialStorageQuery);
                  }}
                >
                  Back to conversations
                </Button>
                {expanded && (
                  <p className="text-sm">
                    {expanded.label} · {formatStorageBytes(expanded.logicalBytes)} across{" "}
                    {expanded.fileCount} histories
                  </p>
                )}
              </div>
            )}
            {page && page.query.view === "groups" && result.groups ? (
              <StorageUsageGroups
                key={`${result.snapshotId}:${page.query.search}`}
                groups={result.groups}
                count={result.matchedGroups ?? result.groups.length}
                search={page.query.search}
                offset={page.query.offset}
                loading={loading}
                onPage={(search, offset) => void load(false, { ...page.query, search, offset })}
                onExpand={(group) => {
                  setExpanded(group);
                  void load(false, { view: "histories", groupId: group.id, search: "", offset: 0 });
                }}
              />
            ) : (
              page && (
                <StorageUsageHistories
                  key={`${result.scannedAt}:${page.query.groupId}:${page.query.search}`}
                  result={result}
                  search={page.query.search}
                  offset={page.query.offset}
                  loading={loading}
                  onPage={(search, offset) => void load(false, { ...page.query, search, offset })}
                />
              )
            )}
          </div>
          <p className="max-w-2xl text-xs leading-relaxed text-muted-foreground">
            Provider histories may also be used by Codex, Claude Code or another T3 installation.
            Unmatched and deleted-chat histories are not automatically safe to remove. This view is
            read-only; rules in Storage settings do not delete provider histories.
          </p>
        </>
      )}
    </div>
  );
}
