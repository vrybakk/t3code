import {
  AuthOrchestrationOperateScope,
  type EnvironmentId,
  type StorageHistoryGroup,
} from "@t3tools/contracts";
import { useState } from "react";
import { useEnvironmentSessionState } from "../../state/session";
import { Button } from "../ui/button";
import { StorageCleanupReview } from "./StorageCleanupReview";
import { formatStorageBytes } from "./StorageUsage.logic";
import { StorageUsageGroups } from "./StorageUsageGroups";
import { StorageUsageHistories } from "./StorageUsageHistories";
import {
  initialStorageQuery,
  type StorageUsagePage,
  type StorageUsageQuery,
} from "./StorageUsageState";

export function StorageHistoryManager({
  environmentId,
  label,
  cleanupSupported,
  page,
  loading,
  load,
}: {
  environmentId: EnvironmentId;
  label: string;
  cleanupSupported: boolean;
  page: StorageUsagePage;
  loading: boolean;
  load: (refresh: boolean, query?: StorageUsageQuery) => Promise<void>;
}) {
  const session = useEnvironmentSessionState(environmentId);
  const canCleanup =
    cleanupSupported &&
    session.data?.authenticated === true &&
    session.data.scopes?.includes(AuthOrchestrationOperateScope) === true;
  const [expanded, setExpanded] = useState<StorageHistoryGroup | null>(null);
  const [groupIds, setGroupIds] = useState<ReadonlySet<string>>(new Set());
  const [historyIds, setHistoryIds] = useState<ReadonlySet<string>>(new Set());
  const { result } = page;
  const clear = () => {
    setGroupIds(new Set());
    setHistoryIds(new Set());
  };
  const toggle = (selected: ReadonlySet<string>, id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else if (next.size < 1_000) next.add(id);
    return next;
  };
  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Large histories (100 MiB or more) and older unlinked histories (30 days) are review
        candidates, not recommendations to delete. Unlinked does not mean unused or safe to remove.
      </p>
      {canCleanup && result.snapshotId ? (
        <StorageCleanupReview
          environmentId={environmentId}
          label={label}
          snapshotId={result.snapshotId}
          groupIds={[...groupIds]}
          historyIds={[...historyIds]}
          disabled={loading}
          onClear={clear}
          onCompleted={() => {
            clear();
            void load(true);
          }}
        />
      ) : (
        <p className="text-xs text-muted-foreground">
          {cleanupSupported
            ? "Native history cleanup requires an authenticated session with operate permission on this machine."
            : "This server supports storage inspection only. Update it to review native history cleanup."}
        </p>
      )}
      {(groupIds.size === 1_000 || historyIds.size === 1_000) && (
        <p role="status" className="text-xs text-warning">
          Selection limit reached. Review this batch before selecting more histories.
        </p>
      )}
      {page.query.groupId && (
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
      {page.query.view === "groups" && result.groups ? (
        <StorageUsageGroups
          key={`${result.snapshotId}:${page.query.search}`}
          groups={result.groups}
          count={result.matchedGroups ?? result.groups.length}
          search={page.query.search}
          offset={page.query.offset}
          loading={loading}
          scannedAt={result.scannedAt}
          selection={
            canCleanup && result.snapshotId
              ? {
                  ids: groupIds,
                  toggle: (id) => setGroupIds((selected) => toggle(selected, id)),
                  disabled: loading,
                }
              : undefined
          }
          onPage={(search, offset) => void load(false, { ...page.query, search, offset })}
          onExpand={(group) => {
            setExpanded(group);
            void load(false, { view: "histories", groupId: group.id, search: "", offset: 0 });
          }}
        />
      ) : (
        <StorageUsageHistories
          key={`${result.scannedAt}:${page.query.groupId}:${page.query.search}`}
          result={result}
          search={page.query.search}
          offset={page.query.offset}
          loading={loading}
          selection={
            canCleanup && result.snapshotId
              ? {
                  ids: historyIds,
                  toggle: (id) => setHistoryIds((selected) => toggle(selected, id)),
                  disabled: loading,
                }
              : undefined
          }
          onPage={(search, offset) => void load(false, { ...page.query, search, offset })}
        />
      )}
    </div>
  );
}
