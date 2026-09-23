import type { StorageHistoryGroup } from "@t3tools/contracts";
import { Button } from "../ui/button";
import { formatStorageBytes } from "./StorageUsage.logic";
import { StorageUsageList } from "./StorageUsageList";
import { Checkbox } from "../ui/checkbox";
import { storageReviewSuggestion } from "./StorageCleanup.logic";

export function StorageUsageGroups({
  groups,
  count,
  search,
  offset,
  loading,
  onPage,
  onExpand,
  selection,
  scannedAt,
}: {
  groups: readonly StorageHistoryGroup[];
  count: number;
  search: string;
  offset: number;
  loading: boolean;
  onPage: (search: string, offset: number) => void;
  onExpand: (group: StorageHistoryGroup) => void;
  scannedAt: string;
  selection?:
    | { ids: ReadonlySet<string>; toggle: (id: string) => void; disabled: boolean }
    | undefined;
}) {
  return (
    <StorageUsageList
      title="Conversations"
      description="Combined history sizes, including proven subagent descendants. Shared files count once."
      search={search}
      offset={offset}
      count={count}
      shown={groups.length}
      loading={loading}
      onPage={onPage}
    >
      <ul
        aria-label="Conversations by combined size"
        aria-busy={loading}
        className="divide-y divide-border/60"
      >
        {groups.map((group) => (
          <li
            key={group.id}
            className="flex min-w-0 items-start justify-between gap-3 rounded-md px-3 py-3 hover:bg-muted/30"
          >
            {selection && (
              <Checkbox
                className="mt-1"
                aria-label={`Select ${group.label}`}
                checked={selection.ids.has(group.id)}
                disabled={loading || selection.disabled}
                onCheckedChange={() => selection.toggle(group.id)}
              />
            )}
            <div className="min-w-0 flex-1 space-y-1">
              <Button
                size="xs"
                variant="ghost"
                className="h-auto max-w-full justify-start whitespace-normal px-0 text-left"
                disabled={loading}
                onClick={() => onExpand(group)}
                aria-label={`View histories for ${group.label}`}
              >
                {group.label}
              </Button>
              <p className="text-xs text-muted-foreground">
                {group.fileCount.toLocaleString()} histories ·{" "}
                {group.subagentCount.toLocaleString()} subagents
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {group.threads.length
                  ? [...new Set(group.threads.map((thread) => thread.projectName))].join(", ")
                  : "Not linked to a chat on this environment"}
              </p>
              {group.threads.length > 1 && (
                <p className="text-xs text-muted-foreground">Shared conversation</p>
              )}
              {group.parentMissing && (
                <p className="text-xs text-muted-foreground">
                  Parent history not found; measured descendants only
                </p>
              )}
              {storageReviewSuggestion(group, scannedAt) && (
                <p className="text-xs text-muted-foreground">
                  {storageReviewSuggestion(group, scannedAt)}
                </p>
              )}
            </div>
            <div className="shrink-0 space-y-1 text-right tabular-nums">
              <p className="text-sm">{formatStorageBytes(group.logicalBytes)}</p>
              <p className="text-xs text-muted-foreground">
                {formatStorageBytes(group.allocatedBytes)} on disk
              </p>
            </div>
          </li>
        ))}
      </ul>
      {groups.length === 0 && (
        <p className="py-4 text-sm text-muted-foreground">
          {search
            ? "No conversations match this search."
            : "No provider histories found in the scanned locations."}
        </p>
      )}
    </StorageUsageList>
  );
}
