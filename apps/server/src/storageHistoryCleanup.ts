// @effect-diagnostics nodeBuiltinImport:off -- Only exact reviewed native history files are unlinked after fresh identity checks.
import * as NodeFSP from "node:fs/promises";
import * as NodeCrypto from "node:crypto";
import { DateTime } from "effect";
import {
  StorageCleanupError,
  type StorageCleanupReviewInput,
  type StorageCleanupReviewResult,
  type StorageCleanupExecuteInput,
  type StorageCleanupExecuteResult,
  type StorageUsageTotals,
} from "@t3tools/contracts";
import type { StorageUsageSnapshot } from "./storageUsageCache.ts";
import { addStorageTotals, type ScannedHistory } from "./storageUsageScan.ts";
import {
  activeStorageGroups,
  validateHistoryForCleanup,
  type StorageCleanupProtection,
} from "./storageHistoryCleanupSafety.ts";

interface CleanupOptions {
  getSnapshot(): StorageUsageSnapshot | undefined;
  invalidate(): void;
  getRoots(): Promise<ReadonlyArray<string>>;
  getProtection(): Promise<StorageCleanupProtection>;
  trashSupported: boolean;
  trash(filePath: string): Promise<void>;
  now?: () => number;
}
interface Plan {
  snapshotId: string;
  expiresAt: number;
  files: ReadonlyArray<ScannedHistory>;
  review: StorageCleanupReviewResult;
  pending?: Promise<StorageCleanupExecuteResult> | undefined;
  result?: StorageCleanupExecuteResult;
  mode?: "trash" | "delete";
}
const emptyTotals = (): StorageUsageTotals => ({
  logicalBytes: 0,
  allocatedBytes: 0,
  fileCount: 0,
});

export function createStorageHistoryCleanup(options: CleanupOptions) {
  const plans = new Map<string, Plan>();
  const now = options.now ?? Date.now;
  const review = async (input: StorageCleanupReviewInput): Promise<StorageCleanupReviewResult> => {
    const snapshot = options.getSnapshot();
    if (!snapshot || snapshot.snapshotId !== input.snapshotId || !snapshot.cleanupFiles)
      throw new StorageCleanupError({
        detail: "Refresh storage before reviewing cleanup.",
        reason: "stale-snapshot",
      });
    if (snapshot.truncated)
      throw new StorageCleanupError({
        detail:
          "Cleanup requires a complete storage scan. Resolve scan limits or unreadable directories and refresh storage.",
        reason: "stale-snapshot",
      });
    const filesById = new Map(snapshot.cleanupFiles.map((file) => [file.id, file]));
    const groups = new Set(snapshot.groups?.map((group) => group.id));
    if (
      input.historyIds.some((id) => !filesById.has(id)) ||
      input.groupIds.some((id) => !groups.has(id))
    )
      throw new StorageCleanupError({
        detail: "The selection is not part of the current storage snapshot.",
        reason: "invalid-selection",
      });
    const selected = new Set(input.historyIds);
    const selectedGroups = new Set(input.groupIds);
    for (const file of snapshot.cleanupFiles)
      if (file.id && file.groupId && selectedGroups.has(file.groupId)) selected.add(file.id);
    if (selected.size === 0 || selected.size > 1000)
      throw new StorageCleanupError({
        detail: "Select between 1 and 1,000 native history files per review.",
        reason: "invalid-selection",
      });
    const files = [...selected].map((id) => filesById.get(id)!);
    const [roots, protection] = await Promise.all([options.getRoots(), options.getProtection()]);
    const activeGroups = activeStorageGroups(snapshot.cleanupFiles, protection);
    const missingParents = new Set(
      snapshot.groups?.filter((group) => group.parentMissing).map((group) => group.id),
    );
    const items: Array<StorageCleanupReviewResult["items"][number]> = [];
    let totals = emptyTotals();
    for (const file of files) {
      const reason =
        file.groupId && missingParents.has(file.groupId)
          ? "A native parent history is missing. Cleanup cannot verify whether its conversation is still open."
          : await validateHistoryForCleanup(file, roots, protection, activeGroups);
      items.push({
        id: file.id!,
        filePath: file.filePath,
        logicalBytes: file.logicalBytes,
        allocatedBytes: file.allocatedBytes,
        eligible: reason === null,
        reason,
      });
      if (reason === null) totals = addStorageTotals(totals, { ...file, fileCount: 1 });
    }
    for (const [id, plan] of plans) if (plan.expiresAt < now() && !plan.pending) plans.delete(id);
    if (plans.size >= 32)
      throw new StorageCleanupError({
        detail: "Too many cleanup reviews are open. Wait for an existing review to expire.",
        reason: "busy",
      });
    const planId = NodeCrypto.randomUUID();
    const expiresAt = now() + 10 * 60_000;
    const result = {
      planId,
      expiresAt: DateTime.formatIso(DateTime.makeUnsafe(expiresAt)),
      trashSupported: options.trashSupported,
      items,
      totals,
      eligibleCount: items.filter((item) => item.eligible).length,
      blockedCount: items.filter((item) => !item.eligible).length,
      warnings: [
        "Nerd checks its chat sessions, but cannot fully detect background provider helpers, other apps, or other T3 servers. Stop all other agent activity on this host before continuing.",
        "Removing native history can prevent resuming or importing that session. This does not delete the Nerd chat or shrink its database.",
      ],
    };
    plans.set(planId, { snapshotId: input.snapshotId, expiresAt, files, review: result });
    return result;
  };
  const execute = async (
    input: StorageCleanupExecuteInput,
  ): Promise<StorageCleanupExecuteResult> => {
    const plan = plans.get(input.planId);
    if (!plan)
      throw new StorageCleanupError({
        detail: "This cleanup review expired. Review the selection again.",
        reason: "expired-plan",
      });
    if (plan.mode && plan.mode !== input.mode)
      throw new StorageCleanupError({
        detail: "This review has already been executed with a different action.",
        reason: "invalid-selection",
      });
    if (plan.result) return plan.result;
    if (plan.pending) return plan.pending;
    if (plan.expiresAt < now())
      throw new StorageCleanupError({
        detail: "This cleanup review expired. Review the selection again.",
        reason: "expired-plan",
      });
    if (
      !input.acknowledgeExternalSessionsStopped ||
      !input.acknowledgeHistoryLoss ||
      (input.mode === "delete" && !input.confirmPermanentDelete)
    )
      throw new StorageCleanupError({
        detail:
          "Confirm that external sessions are stopped and that native resume history may be lost. Permanent deletion needs separate confirmation.",
        reason: "confirmation-required",
      });
    if (input.mode === "trash" && !options.trashSupported)
      throw new StorageCleanupError({
        detail: "Move to Trash is not supported on this server. Nothing was deleted.",
        reason: "unsupported",
      });
    const snapshot = options.getSnapshot();
    if (!snapshot || snapshot.snapshotId !== plan.snapshotId)
      throw new StorageCleanupError({
        detail: "The storage snapshot changed. Review cleanup again.",
        reason: "stale-snapshot",
      });
    plan.mode = input.mode;
    plan.pending = (async () => {
      const deadline = now() + 30_000;
      const budgetExceeded = () =>
        now() >= deadline ? "Cleanup time limit reached. Review the remaining files again." : null;
      const [roots, protection] = await Promise.all([options.getRoots(), options.getProtection()]);
      const activeGroups = activeStorageGroups(snapshot.cleanupFiles ?? [], protection);
      const items: Array<StorageCleanupExecuteResult["items"][number]> = [];
      let processedTotals = emptyTotals();
      for (const [index, file] of plan.files.entries()) {
        const blocked =
          plan.review.items[index]!.reason ??
          budgetExceeded() ??
          (await validateHistoryForCleanup(file, roots, protection, activeGroups)) ??
          budgetExceeded();
        if (blocked) {
          items.push({ id: file.id!, filePath: file.filePath, status: "blocked", reason: blocked });
          continue;
        }
        try {
          // Keep admission until this mutation settles, even if it outlasts the batch budget.
          if (input.mode === "trash") await options.trash(file.filePath);
          else await NodeFSP.unlink(file.filePath);
          items.push({
            id: file.id!,
            filePath: file.filePath,
            status: input.mode === "trash" ? "trashed" : "deleted",
            reason: null,
          });
          processedTotals = addStorageTotals(processedTotals, { ...file, fileCount: 1 });
        } catch {
          items.push({
            id: file.id!,
            filePath: file.filePath,
            status: "failed",
            reason: "The file could not be removed. No fallback deletion was attempted.",
          });
        }
      }
      const result = { planId: input.planId, mode: input.mode, items, processedTotals };
      plan.result = result;
      if (processedTotals.fileCount > 0) options.invalidate();
      return result;
    })().finally(() => {
      plan.pending = undefined;
    });
    return plan.pending;
  };
  return { review, execute };
}
