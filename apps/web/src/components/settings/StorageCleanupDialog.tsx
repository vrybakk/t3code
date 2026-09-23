import type {
  EnvironmentId,
  StorageCleanupExecuteResult,
  StorageCleanupReviewResult,
} from "@t3tools/contracts";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import { useEffect, useRef, useState } from "react";
import { storageExecuteCleanup } from "../../state/storageUsage";
import { useAtomCommand } from "../../state/use-atom-command";
import { Button } from "../ui/button";
import { Checkbox } from "../ui/checkbox";
import { Input } from "../ui/input";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "../ui/dialog";
import { toastManager } from "../ui/toast";
import { formatStorageBytes } from "./StorageUsage.logic";
import { StorageCleanupItems } from "./StorageCleanupItems";

export function StorageCleanupDialog({
  preview,
  environmentId,
  label,
  onClose,
  onCompleted,
}: {
  preview: StorageCleanupReviewResult;
  environmentId: EnvironmentId;
  label: string;
  onClose: () => void;
  onCompleted: () => void;
}) {
  const execute = useAtomCommand(storageExecuteCleanup, { reportFailure: false });
  const [mode, setMode] = useState<"trash" | "delete">("trash");
  const [externalStopped, setExternalStopped] = useState(false);
  const [historyLoss, setHistoryLoss] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<StorageCleanupExecuteResult | null>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const close = () => {
    if (!pending) {
      if (outcome) onCompleted();
      onClose();
    }
  };
  async function performCleanup() {
    setPending(true);
    setError(null);
    const response = await execute({
      environmentId,
      input: {
        planId: preview.planId,
        mode,
        acknowledgeExternalSessionsStopped: externalStopped,
        acknowledgeHistoryLoss: historyLoss,
        confirmPermanentDelete: mode === "delete" && confirmation === "DELETE",
      },
    });
    if (!alive.current) return;
    setPending(false);
    if (response._tag === "Success") {
      setOutcome(response.value);
      const processed = response.value.items.filter(
        (item) => item.status === "trashed" || item.status === "deleted",
      ).length;
      const skipped = response.value.items.length - processed;
      toastManager.add({
        type: skipped ? "warning" : "success",
        title:
          processed === 0
            ? "No files removed"
            : skipped
              ? "Cleanup finished with skipped files"
              : mode === "trash"
                ? "Histories moved to Trash"
                : "Histories permanently deleted",
        description: `${processed} processed; ${skipped} blocked or failed. ${processed === 0 ? "Selected files were kept." : mode === "trash" ? "Trash must be emptied separately to reclaim disk space." : "Disk space reclaimed has not been measured."}`,
      });
    } else if (!isAtomCommandInterrupted(response)) {
      const failure = squashAtomCommandFailure(response);
      setError(
        failure instanceof Error
          ? failure.message
          : "Cleanup could not complete. Close this dialog and review the selection again.",
      );
    }
  }
  const disabled =
    pending ||
    outcome !== null ||
    error !== null ||
    preview.eligibleCount === 0 ||
    !externalStopped ||
    !historyLoss ||
    (mode === "trash" ? !preview.trashSupported : confirmation !== "DELETE");
  const processedCount =
    outcome?.items.filter((item) => item.status === "trashed" || item.status === "deleted")
      .length ?? 0;
  const totals = outcome?.processedTotals ?? preview.totals;
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DialogPopup showCloseButton={!pending}>
        <DialogHeader>
          <DialogTitle>Review native history cleanup</DialogTitle>
          <DialogDescription>
            On {label} ·{" "}
            {outcome
              ? `${processedCount} processed · ${outcome.items.length - processedCount} blocked or failed`
              : `${preview.eligibleCount} eligible files · ${preview.blockedCount} blocked`}
          </DialogDescription>
        </DialogHeader>
        <DialogPanel className="space-y-4">
          <p className="text-sm">
            {outcome ? "Processed file sizes" : "Eligible file sizes"}:{" "}
            {formatStorageBytes(totals.logicalBytes)} · Allocated:{" "}
            {formatStorageBytes(totals.allocatedBytes)}. This is not a promise of freed space.
          </p>
          <p className="text-xs text-muted-foreground">
            Removing provider history can prevent Codex or Claude Code from resuming those sessions.
            T3 chats and project files remain. Native app indexes may still show removed sessions.
          </p>
          {[...new Set(preview.warnings)].map((warning) => (
            <p key={warning} className="text-xs text-warning">
              {warning}
            </p>
          ))}
          <StorageCleanupItems preview={preview} outcome={outcome} />
          {outcome ? (
            <p role="status" className="text-sm">
              {processedCount === 0 ? "No files were removed." : "Cleanup finished."} Review each
              file's outcome above.{" "}
              {processedCount === 0
                ? "All selected files were kept."
                : outcome.mode === "trash"
                  ? "Files in Trash still occupy disk space until you empty it."
                  : "Permanently deleted files cannot be restored from Trash."}
            </p>
          ) : (
            <>
              <div role="group" aria-label="Cleanup action" className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant={mode === "trash" ? "default" : "outline"}
                  aria-pressed={mode === "trash"}
                  disabled={pending}
                  onClick={() => {
                    setMode("trash");
                    setConfirmation("");
                  }}
                >
                  Move to Trash
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  aria-pressed={mode === "delete"}
                  disabled={pending}
                  onClick={() => {
                    setMode("delete");
                    setConfirmation("");
                  }}
                >
                  Permanently delete instead
                </Button>
              </div>
              {!preview.trashSupported && (
                <p role="status" className="text-sm text-warning">
                  Trash is unavailable on this machine. Nothing will be permanently deleted unless
                  you explicitly choose that action and confirm it.
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                {mode === "trash"
                  ? "Trash is recoverable until emptied and does not free disk space immediately."
                  : "Permanent deletion bypasses Trash and cannot be undone."}
              </p>
              <label className="flex items-start gap-2 text-sm">
                <Checkbox
                  aria-label="I stopped other agent activity on this machine"
                  checked={externalStopped}
                  disabled={pending}
                  onCheckedChange={setExternalStopped}
                />
                <span>
                  I stopped other agent activity on this machine. Sessions in other apps, other T3
                  servers and background provider helpers cannot be fully verified.
                </span>
              </label>
              <label className="flex items-start gap-2 text-sm">
                <Checkbox
                  aria-label="I understand native history and resume may be lost"
                  checked={historyLoss}
                  disabled={pending}
                  onCheckedChange={setHistoryLoss}
                />
                <span>I understand that native session history and resume may be lost.</span>
              </label>
              {mode === "delete" && (
                <label className="block space-y-2 text-sm">
                  <span>Type DELETE to confirm permanent deletion.</span>
                  <Input
                    aria-label="Permanent deletion confirmation"
                    value={confirmation}
                    onChange={(event) => setConfirmation(event.target.value)}
                    disabled={pending}
                    autoComplete="off"
                  />
                </label>
              )}
              <p className="text-xs text-muted-foreground">
                Review expires {new Date(preview.expiresAt).toLocaleString()}. Files are checked
                again before cleanup.
              </p>
            </>
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error} Close and review again before another attempt.
            </p>
          )}
        </DialogPanel>
        <DialogFooter>
          <Button variant="outline" disabled={pending} onClick={close}>
            {outcome ? "Done and refresh" : "Cancel"}
          </Button>
          {!outcome && (
            <Button
              variant={mode === "delete" ? "destructive" : "default"}
              disabled={disabled}
              onClick={() => void performCleanup()}
            >
              {pending
                ? "Processing…"
                : mode === "trash"
                  ? "Confirm move to Trash"
                  : "Confirm permanent deletion"}
            </Button>
          )}
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
