import type { StorageHistory } from "@t3tools/contracts";

export function storageReviewSuggestion(
  item: Pick<StorageHistory, "logicalBytes" | "threads"> & { modifiedAt?: string },
  scannedAt: string,
): string | null {
  if (item.logicalBytes >= 100 * 1_024 * 1_024) return "Large history · review candidate";
  if (
    item.threads.length === 0 &&
    item.modifiedAt &&
    Date.parse(scannedAt) - Date.parse(item.modifiedAt) >= 30 * 86_400_000
  ) {
    return "Older unlinked history · review candidate";
  }
  return null;
}
