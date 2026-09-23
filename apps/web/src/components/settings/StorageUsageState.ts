import type { EnvironmentId, StorageUsageInput, StorageUsageResult } from "@t3tools/contracts";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import { useEffect, useRef, useState } from "react";

import { storageUsageGet } from "../../state/storageUsage";
import { useAtomCommand } from "../../state/use-atom-command";
import { STORAGE_HISTORY_PAGE_SIZE } from "./StorageUsage.logic";

export interface StorageUsageQuery {
  view: "histories" | "groups" | "directory";
  search: string;
  offset: number;
  groupId?: string;
  directoryId?: string;
}
export interface StorageUsagePage {
  result: StorageUsageResult;
  query: StorageUsageQuery;
}
export const initialStorageQuery: StorageUsageQuery = { view: "groups", search: "", offset: 0 };

export function useStorageUsage(environmentId: EnvironmentId) {
  const getUsage = useAtomCommand(storageUsageGet, { reportFailure: false });
  const [historyPage, setHistoryPage] = useState<StorageUsagePage | null>(null);
  const [directoryPage, setDirectoryPage] = useState<StorageUsagePage | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);
  useEffect(
    () => () => {
      requestId.current += 1;
    },
    [],
  );

  async function load(refresh: boolean, query: StorageUsageQuery = initialStorageQuery) {
    const id = ++requestId.current;
    setLoading(true);
    setError(null);
    const snapshotId = (historyPage ?? directoryPage)?.result.snapshotId;
    const input: StorageUsageInput = {
      ...query,
      refresh,
      limit: STORAGE_HISTORY_PAGE_SIZE,
      ...(!refresh && snapshotId ? { snapshotId } : {}),
    };
    const response = await getUsage({ environmentId, input });
    if (id !== requestId.current) return;
    setLoading(false);
    if (response._tag === "Success") {
      const result = response.value;
      const actualQuery =
        query.view === "groups" && result.groups === undefined
          ? { ...query, view: "histories" as const }
          : query;
      const entries =
        actualQuery.view === "groups"
          ? result.groups
          : actualQuery.view === "directory"
            ? result.directory?.entries
            : result.histories;
      if (query.offset > 0 && entries?.length === 0) {
        void load(false, { ...query, offset: 0 });
        return;
      }
      if (refresh) setDirectoryPage(null);
      const page = { result, query: actualQuery };
      if (query.view === "directory") setDirectoryPage(page);
      else setHistoryPage(page);
    } else if (!isAtomCommandInterrupted(response)) {
      const failure = squashAtomCommandFailure(response);
      if (failure instanceof Error && "reason" in failure && failure.reason === "stale-snapshot") {
        setHistoryPage(null);
        setDirectoryPage(null);
      }
      setError(
        failure instanceof Error ? failure.message : "Storage scan failed. Try scanning again.",
      );
    }
  }
  return { historyPage, directoryPage, loading, error, load };
}
