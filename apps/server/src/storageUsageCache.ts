import type { StorageUsageInput, StorageUsageResult } from "@t3tools/contracts";

export function createStorageUsageCache(scan: () => Promise<StorageUsageResult>) {
  let snapshot: StorageUsageResult | undefined;
  let pending: Promise<StorageUsageResult> | undefined;
  return async (input: StorageUsageInput): Promise<StorageUsageResult> => {
    if (pending) await pending;
    else if (!snapshot || input.refresh) {
      pending = scan()
        .then((result) => {
          snapshot = result;
          return result;
        })
        .finally(() => {
          pending = undefined;
        });
      await pending;
    }
    const current = snapshot!;
    const search = input.search.trim().toLocaleLowerCase();
    const histories = search
      ? current.histories.filter((history) =>
          [
            history.filePath,
            history.provider,
            ...history.threads.flatMap((thread) => [thread.title, thread.projectName]),
          ].some((value) => value.toLocaleLowerCase().includes(search)),
        )
      : current.histories;
    return {
      ...current,
      histories: histories.slice(input.offset, input.offset + input.limit),
      matchedHistories: histories.length,
    };
  };
}
