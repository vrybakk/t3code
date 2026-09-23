import type { StorageUsageResult } from "@t3tools/contracts";
import { useState } from "react";

import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import {
  formatStorageBytes,
  STORAGE_HISTORY_PAGE_SIZE,
  storageHistoryLabel,
  storageHistoryStatus,
} from "./StorageUsage.logic";

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
  const [draft, setDraft] = useState(search);
  const count = result.matchedHistories;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium">Largest histories</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Sorted by file size. Shared histories are counted once.
          </p>
        </div>
        <form
          className="flex w-full items-center gap-2 sm:w-auto"
          onSubmit={(event) => {
            event.preventDefault();
            onPage(draft.trim(), 0);
          }}
        >
          <Input
            size="compact"
            type="search"
            aria-label="Search histories"
            placeholder="Project, chat or file…"
            value={draft}
            maxLength={200}
            onChange={(event) => setDraft(event.target.value)}
          />
          <Button size="xs" variant="outline" type="submit" disabled={loading}>
            Search
          </Button>
        </form>
      </div>
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
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
        <span>
          {count === 0 ? "0" : `${offset + 1}–${Math.min(offset + result.histories.length, count)}`}{" "}
          of {count.toLocaleString()}
          {search ? " matches" : " histories"}
        </span>
        <div className="flex items-center gap-2">
          <Button
            size="xs"
            variant="outline"
            disabled={loading || offset === 0}
            onClick={() => onPage(search, Math.max(0, offset - STORAGE_HISTORY_PAGE_SIZE))}
          >
            Previous
          </Button>
          <span>
            Page {Math.floor(offset / STORAGE_HISTORY_PAGE_SIZE) + 1} of{" "}
            {Math.max(1, Math.ceil(count / STORAGE_HISTORY_PAGE_SIZE))}
          </span>
          <Button
            size="xs"
            variant="outline"
            disabled={loading || offset + STORAGE_HISTORY_PAGE_SIZE >= count}
            onClick={() => onPage(search, offset + STORAGE_HISTORY_PAGE_SIZE)}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
