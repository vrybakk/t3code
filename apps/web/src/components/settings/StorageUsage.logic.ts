import type { StorageHistory } from "@t3tools/contracts";

export const STORAGE_HISTORY_PAGE_SIZE = 25;

export function formatStorageBytes(bytes: number | null): string {
  if (bytes === null) return "Unavailable";
  if (bytes < 1_024) return `${bytes} B`;
  const units = ["KiB", "MiB", "GiB", "TiB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1_024)) - 1, units.length - 1);
  return `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(bytes / 1_024 ** (index + 1))} ${units[index]}`;
}

export function storageHistoryLabel(history: StorageHistory): string {
  return (
    history.threads.map((thread) => thread.title).join(", ") ||
    history.filePath.split(/[\\/]/).at(-1) ||
    history.filePath
  );
}

export function storageHistoryStatus(history: StorageHistory): string {
  if (history.threads.length > 1) return "Shared history";
  const thread = history.threads[0];
  if (!thread) return history.archived ? "Unmatched · archived history" : "Unmatched";
  return { linked: "Linked", active: "Active", archived: "Archived chat", deleted: "Deleted chat" }[
    thread.status
  ];
}
