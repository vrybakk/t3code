import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/shell";
import type { WorkManualEntryInput, WorkRecord, WorkTrackingProject } from "@t3tools/contracts";
import { useRef, useState } from "react";

import {
  Dialog,
  DialogDescription,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "../ui/dialog";
import { WorkManualEntries } from "./WorkManualEntries";

export function WorkEntryDialog({
  open,
  onOpenChange,
  projects,
  threads,
  record,
  onSave,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly projects: ReadonlyArray<WorkTrackingProject>;
  readonly threads: ReadonlyArray<EnvironmentThreadShell>;
  readonly record?: WorkRecord | null;
  readonly onSave: (input: WorkManualEntryInput) => Promise<boolean>;
}) {
  const [pending, setPending] = useState(false);
  const saving = useRef(false);
  const save = async (input: WorkManualEntryInput) => {
    if (saving.current) return false;
    saving.current = true;
    setPending(true);
    try {
      const saved = await onSave(input);
      if (saved) onOpenChange(false);
      return saved;
    } finally {
      saving.current = false;
      setPending(false);
    }
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(next, details) => {
        if (saving.current) details.cancel();
        else onOpenChange(next);
      }}
    >
      {open ? (
        <DialogPopup className="sm:max-w-2xl" showCloseButton={!pending}>
          <DialogHeader>
            <DialogTitle>{record ? "Edit entry" : "Add entry"}</DialogTitle>
            <DialogDescription>
              Record manual work. Agent activity is captured automatically.
            </DialogDescription>
          </DialogHeader>
          <DialogPanel>
            <WorkManualEntries
              key={record?.id ?? "new"}
              projects={projects}
              threads={threads}
              record={record ?? null}
              pending={pending}
              onSave={save}
              onCancel={() => {
                if (!saving.current) onOpenChange(false);
              }}
            />
          </DialogPanel>
        </DialogPopup>
      ) : null}
    </Dialog>
  );
}
