import type { DesktopKeepAwakeState } from "@t3tools/contracts";
import { CoffeeIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "../ui/button";
import { stackedThreadToast, toastManager } from "../ui/toast";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

function reportError(description: string) {
  toastManager.add(
    stackedThreadToast({ type: "error", title: "Keep awake unavailable", description }),
  );
}

export function DesktopKeepAwakeToggle({ onBackdrop }: { onBackdrop: boolean }) {
  const bridge = window.desktopBridge;
  const supported =
    bridge?.getClientPlatform?.() === "darwin" &&
    bridge.getKeepAwakeState &&
    bridge.setKeepAwakeEnabled &&
    bridge.onKeepAwakeState;
  const [state, setState] = useState<DesktopKeepAwakeState | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!supported) return;
    let active = true;
    let receivedEvent = false;
    const unsubscribe = bridge.onKeepAwakeState!((next) => {
      receivedEvent = true;
      setState(next);
      if (next.error) reportError(next.error);
    });
    void bridge.getKeepAwakeState!().then(
      (next) => {
        if (active && !receivedEvent) setState(next);
      },
      (error: unknown) => {
        if (active) reportError(error instanceof Error ? error.message : String(error));
      },
    );
    return () => {
      active = false;
      unsubscribe();
    };
  }, [bridge, supported]);

  if (!supported) return null;
  const enabled = state?.enabled ?? false;
  const label = enabled ? "Turn off keep awake" : "Keep this Mac awake";
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            aria-label={label}
            aria-pressed={enabled}
            className="relative top-auto z-10 translate-y-0"
            disabled={!state || pending}
            size="icon-sm"
            variant={enabled ? "secondary" : onBackdrop ? "media-navigation" : "ghost"}
            onClick={() => {
              setPending(true);
              void bridge.setKeepAwakeEnabled!(!enabled)
                .catch((error: unknown) => {
                  reportError(error instanceof Error ? error.message : String(error));
                })
                .finally(() => setPending(false));
            }}
          >
            <CoffeeIcon />
          </Button>
        }
      />
      <TooltipPopup side="bottom">
        {label}. Prevents idle sleep on battery and AC power while this app is open.
      </TooltipPopup>
    </Tooltip>
  );
}
