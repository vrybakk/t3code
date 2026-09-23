import type { StorageCleanupExecuteResult, StorageCleanupReviewResult } from "@t3tools/contracts";
import { useState } from "react";
import { Button } from "../ui/button";
import { formatStorageBytes } from "./StorageUsage.logic";

export function StorageCleanupItems({
  preview,
  outcome,
}: {
  preview: StorageCleanupReviewResult;
  outcome: StorageCleanupExecuteResult | null;
}) {
  const [offset, setOffset] = useState(0);
  const outcomes = new Map(outcome?.items.map((item) => [item.id, item]));
  return (
    <div className="space-y-3">
      <ul
        aria-label="Reviewed history files"
        className="max-h-64 divide-y divide-border overflow-y-auto rounded-lg border border-border px-3"
      >
        {preview.items.slice(offset, offset + 25).map((item) => {
          const executed = outcomes.get(item.id);
          return (
            <li key={item.id} className="space-y-1 py-3 text-xs">
              <p className="break-all text-foreground">{item.filePath}</p>
              <p className="text-muted-foreground">
                {formatStorageBytes(item.logicalBytes)} file size ·{" "}
                {formatStorageBytes(item.allocatedBytes)} allocated
              </p>
              <p
                className={
                  !item.eligible || executed?.status === "failed" || executed?.status === "blocked"
                    ? "text-warning"
                    : "text-muted-foreground"
                }
              >
                {executed
                  ? `${executed.status}${executed.reason ? `: ${executed.reason}` : ""}`
                  : item.eligible
                    ? "Eligible for the selected action"
                    : `Blocked: ${item.reason ?? "Not eligible"}`}
              </p>
            </li>
          );
        })}
      </ul>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>
          {preview.items.length ? offset + 1 : 0}–{Math.min(offset + 25, preview.items.length)} of{" "}
          {preview.items.length} files
        </span>
        <div className="flex gap-2">
          <Button
            size="xs"
            variant="outline"
            disabled={offset === 0}
            onClick={() => setOffset(Math.max(0, offset - 25))}
          >
            Previous files
          </Button>
          <Button
            size="xs"
            variant="outline"
            disabled={offset + 25 >= preview.items.length}
            onClick={() => setOffset(offset + 25)}
          >
            Next files
          </Button>
        </div>
      </div>
    </div>
  );
}
