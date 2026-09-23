import type { EnvironmentId, StorageCleanupReviewResult } from "@t3tools/contracts";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import { useEffect, useRef, useState } from "react";
import { storageReviewCleanup } from "../../state/storageUsage";
import { useAtomCommand } from "../../state/use-atom-command";
import { Button } from "../ui/button";
import { StorageCleanupDialog } from "./StorageCleanupDialog";

export function StorageCleanupReview({
  environmentId,
  label,
  snapshotId,
  groupIds,
  historyIds,
  disabled,
  onCompleted,
  onClear,
}: {
  environmentId: EnvironmentId;
  label: string;
  snapshotId: string;
  groupIds: readonly string[];
  historyIds: readonly string[];
  disabled: boolean;
  onCompleted: () => void;
  onClear: () => void;
}) {
  const review = useAtomCommand(storageReviewCleanup, { reportFailure: false });
  const [preview, setPreview] = useState<StorageCleanupReviewResult | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  async function reviewSelection() {
    setPending(true);
    setError(null);
    const response = await review({
      environmentId,
      input: { snapshotId, groupIds: [...groupIds], historyIds: [...historyIds] },
    });
    if (!alive.current) return;
    setPending(false);
    if (response._tag === "Success") setPreview(response.value);
    else if (!isAtomCommandInterrupted(response)) {
      const failure = squashAtomCommandFailure(response);
      setError(
        failure instanceof Error
          ? failure.message
          : "Could not review the selected histories. Rescan and try again.",
      );
    }
  }
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <p className="mr-auto text-xs text-muted-foreground">
          {groupIds.length} groups and {historyIds.length} individual files selected. Overlaps are
          counted once during review.
        </p>
        <Button
          size="xs"
          variant="outline"
          disabled={disabled || pending || groupIds.length + historyIds.length === 0}
          onClick={() => void reviewSelection()}
        >
          {pending ? "Reviewing…" : "Review cleanup"}
        </Button>
        <Button
          size="xs"
          variant="ghost"
          disabled={pending || groupIds.length + historyIds.length === 0}
          onClick={onClear}
        >
          Clear selection
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {preview && (
        <StorageCleanupDialog
          key={preview.planId}
          preview={preview}
          environmentId={environmentId}
          label={label}
          onClose={() => setPreview(null)}
          onCompleted={onCompleted}
        />
      )}
    </div>
  );
}
