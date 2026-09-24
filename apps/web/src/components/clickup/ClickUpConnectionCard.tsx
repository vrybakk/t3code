import { useAtomValue } from "@effect/atom-react";
import type { EnvironmentId } from "@t3tools/contracts";
import * as Option from "effect/Option";
import { AsyncResult } from "effect/unstable/reactivity";
import { useEffect, useState } from "react";
import { ensureLocalApi } from "../../localApi";
import { appAtomRegistry } from "../../rpc/atomRegistry";
import { serverEnvironment } from "../../state/server";
import { useAtomCommand } from "../../state/use-atom-command";
import { Button } from "../ui/button";
import { toastManager } from "../ui/toast";

export function ClickUpConnectionCard({ environmentId }: { environmentId: EnvironmentId }) {
  const query = serverEnvironment.clickUpConnection({ environmentId, input: {} });
  const result = useAtomValue(query);
  const data = Option.getOrNull(AsyncResult.value(result));
  const connect = useAtomCommand(serverEnvironment.clickUpConnect);
  const disconnect = useAtomCommand(serverEnvironment.clickUpDisconnect);
  const [busy, setBusy] = useState(false);
  const [failedAvatarUrl, setFailedAvatarUrl] = useState<string | null>(null);
  const avatarUrl = data?.user?.avatarUrl;
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const signingIn = startedAt !== null && !data?.user;

  useEffect(() => {
    if (!signingIn || startedAt === null) return;
    const refresh = () => {
      if (!result.waiting && document.visibilityState === "visible") {
        appAtomRegistry.refresh(query);
      }
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    const poll = signingIn ? window.setInterval(refresh, 2_000) : undefined;
    const expiry =
      signingIn && startedAt !== null
        ? window.setTimeout(
            () => {
              setStartedAt(null);
              toastManager.add({
                type: "error",
                title: "ClickUp sign-in timed out. Please try again.",
              });
            },
            Math.max(0, startedAt + 10 * 60_000 - Date.now()),
          )
        : undefined;
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
      window.clearInterval(poll);
      window.clearTimeout(expiry);
    };
  }, [query, result.waiting, signingIn, startedAt]);

  async function begin() {
    setBusy(true);
    setStartedAt(null);
    try {
      if (AsyncResult.isFailure(result)) {
        const cleared = await disconnect({ environmentId, input: {} });
        if (cleared._tag !== "Success") {
          return;
        }
      }
      const response = await connect({
        environmentId,
        input: { returnToApp: !window.desktopBridge },
      });
      if (response._tag !== "Success") {
        return;
      }
      if (window.desktopBridge) {
        await ensureLocalApi().shell.openExternal(response.value.url);
      } else {
        window.location.assign(response.value.url);
      }
      setStartedAt(Date.now());
    } catch {
      toastManager.add({ type: "error", title: "Could not open ClickUp sign-in. Try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-border p-4">
      <div className="flex min-w-0 items-center gap-3">
        {data?.user &&
          (avatarUrl && failedAvatarUrl !== avatarUrl ? (
            <img
              src={avatarUrl}
              alt=""
              className="size-8 shrink-0 rounded-full bg-muted object-cover"
              onError={() => setFailedAvatarUrl(avatarUrl)}
            />
          ) : (
            <span
              aria-hidden
              className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-medium text-muted-foreground"
            >
              {data.user.username.slice(0, 1).toUpperCase()}
            </span>
          ))}
        <p className="min-w-0 break-words text-sm" role="status">
          {AsyncResult.isFailure(result)
            ? data?.user
              ? "Could not verify your ClickUp connection. Disconnect to sign in again."
              : "Could not verify your ClickUp connection. Try connecting again."
            : data?.user
              ? `Connected as ${data.user.username}`
              : data?.configured === false
                ? "Your CTO needs to configure ClickUp for this environment before you can connect."
                : signingIn
                  ? "Finish signing in to ClickUp in your browser. Nerd will connect automatically."
                  : result.waiting
                    ? "Checking ClickUp connection…"
                    : "Connect ClickUp to see tasks assigned to you."}
        </p>
      </div>
      <div className="ml-auto shrink-0">
        {data?.user ? (
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setStartedAt(null);
              try {
                const response = await disconnect({ environmentId, input: {} });
                if (response._tag === "Success") appAtomRegistry.refresh(query);
              } finally {
                setBusy(false);
              }
            }}
          >
            Disconnect
          </Button>
        ) : (
          data?.configured !== false && (
            <Button
              size="sm"
              disabled={busy || (!data && result.waiting)}
              onClick={() => void begin()}
            >
              {busy ? "Opening ClickUp…" : signingIn ? "Try again" : "Connect ClickUp"}
            </Button>
          )
        )}
      </div>
    </div>
  );
}
