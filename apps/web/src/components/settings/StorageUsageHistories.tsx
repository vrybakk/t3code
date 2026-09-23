import type { StorageUsageResult } from "@t3tools/contracts";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import {
  formatStorageBytes,
  storageHistoryLabel,
  storageHistoryStatus,
} from "./StorageUsage.logic";
import { StorageUsageList } from "./StorageUsageList";

export function StorageUsageHistories({
  result,
  search,
  offset,
  loading,
  onPage,
}: {
  result: StorageUsageResult;
  search: string;
  offset: number;
  loading: boolean;
  onPage: (search: string, offset: number) => void;
}) {
  return (
    <StorageUsageList
      title="Largest histories"
      description="Sorted by file size. Shared histories are counted once."
      search={search}
      offset={offset}
      count={result.matchedHistories}
      shown={result.histories.length}
      loading={loading}
      onPage={onPage}
    >
      <ul
        className="divide-y divide-border/60"
        aria-label="Histories by file size"
        aria-busy={loading}
      >
        {result.histories.map((history) => (
          <li
            key={history.filePath}
            className="flex min-w-0 items-start justify-between gap-3 rounded-md px-3 py-3 hover:bg-muted/30"
          >
            <div className="min-w-0 space-y-1">
              <Tooltip>
                <TooltipTrigger
                  render={
                    <span
                      tabIndex={0}
                      className="block truncate text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                  }
                >
                  {storageHistoryLabel(history)}
                </TooltipTrigger>
                <TooltipPopup className="max-w-sm break-all">{history.filePath}</TooltipPopup>
              </Tooltip>
              <p className="truncate text-xs text-muted-foreground">
                {history.provider === "codex" ? "Codex" : "Claude Code"}
                {history.threads.length > 0
                  ? ` · ${[...new Set(history.threads.map((thread) => thread.projectName))].join(", ")}`
                  : " · Not linked to a chat on this environment"}
              </p>
              <p className="text-xs text-muted-foreground">{storageHistoryStatus(history)}</p>
              {history.relationship === "subagent" && (
                <p className="text-xs text-muted-foreground">Subagent history</p>
              )}
              <p className="text-xs text-muted-foreground">
                Modified {new Date(history.modifiedAt).toLocaleString()}
              </p>
            </div>
            <div className="shrink-0 space-y-1 text-right tabular-nums">
              <p className="text-sm">{formatStorageBytes(history.logicalBytes)}</p>
              <p className="text-xs text-muted-foreground">
                {formatStorageBytes(history.allocatedBytes)} on disk
              </p>
            </div>
          </li>
        ))}
      </ul>
      {result.histories.length === 0 && (
        <p className="py-4 text-sm text-muted-foreground">
          {search
            ? "No histories match this search."
            : "No provider histories found in the scanned locations."}
        </p>
      )}
    </StorageUsageList>
  );
}
