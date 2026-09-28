import { useAtomValue } from "@effect/atom-react";
import type { EnvironmentId, ThreadId } from "@t3tools/contracts";
import * as Option from "effect/Option";
import { AsyncResult } from "effect/unstable/reactivity";
import { useEffect, useState } from "react";
import { appAtomRegistry } from "../../rpc/atomRegistry";
import { useServerConfigs } from "../../state/entities";
import { serverEnvironment } from "../../state/server";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogDescription,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "../ui/dialog";
import { ClickUpTimeSyncRecords } from "./ClickUpTimeSyncRecords";

export function ClickUpTimeSync({
  environmentId,
  threadId,
}: {
  environmentId: EnvironmentId;
  threadId?: ThreadId;
}) {
  const supported =
    useServerConfigs().get(environmentId)?.environment.capabilities.clickUpTimeSync === true;
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!supported) return null;
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        Sync ClickUp time
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next, event) => {
          if (busy) event.cancel();
          else setOpen(next);
        }}
      >
        {open && (
          <DialogPopup className="sm:max-w-2xl" showCloseButton={!busy}>
            <DialogHeader>
              <DialogTitle>Sync ClickUp time</DialogTitle>
              <DialogDescription>
                Review recorded time and choose one task for each entry. Nothing is sent until you
                sync.
              </DialogDescription>
            </DialogHeader>
            <DialogPanel>
              <TimeSyncAccount
                environmentId={environmentId}
                threadId={threadId}
                onBusyChange={setBusy}
              />
            </DialogPanel>
          </DialogPopup>
        )}
      </Dialog>
    </>
  );
}

function TimeSyncAccount({
  environmentId,
  threadId,
  onBusyChange,
}: {
  environmentId: EnvironmentId;
  threadId?: ThreadId | undefined;
  onBusyChange: (busy: boolean) => void;
}) {
  const query = serverEnvironment.clickUpConnection({ environmentId, input: {} });
  const result = useAtomValue(query);
  const account = Option.getOrNull(AsyncResult.value(result));
  useEffect(() => {
    appAtomRegistry.refresh(query);
  }, [query]);
  if (result.waiting)
    return (
      <p role="status" className="text-sm text-muted-foreground">
        Checking ClickUp connection…
      </p>
    );
  if (AsyncResult.isFailure(result) || !account?.user)
    return (
      <p className="text-sm text-muted-foreground">
        Connect ClickUp in Settings, then reopen this dialog.
      </p>
    );
  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Exporting as {account.user.username}. Agent runtime includes waiting and is labeled
        separately from manual work. Subagent totals are excluded. Entries are non-billable.
      </p>
      <ClickUpTimeSyncRecords
        key={account.user.id}
        environmentId={environmentId}
        threadId={threadId}
        userId={account.user.id}
        onBusyChange={onBusyChange}
      />
    </div>
  );
}
