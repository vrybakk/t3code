import { useAtomValue } from "@effect/atom-react";
import { AuthAccessWriteScope, type EnvironmentId } from "@t3tools/contracts";
import * as Option from "effect/Option";
import { AsyncResult } from "effect/unstable/reactivity";
import { useId, useRef, useState } from "react";
import { isElectron } from "../../env";
import { usePrimarySessionState } from "../../environments/primary";
import { appAtomRegistry } from "../../rpc/atomRegistry";
import { serverEnvironment } from "../../state/server";
import { useEnvironmentSessionState } from "../../state/session";
import { useAtomCommand } from "../../state/use-atom-command";
import { Button } from "../ui/button";
import { Input } from "../ui/input";

const DEFAULT_REDIRECT_URI = "http://localhost:6326/api/integrations/clickup/callback";

export function ClickUpOAuthSettings({
  environmentId,
  isPrimary,
}: {
  environmentId: EnvironmentId;
  isPrimary: boolean;
}) {
  if (isPrimary && isElectron) return <OAuthConfiguration environmentId={environmentId} />;
  return isPrimary ? (
    <PrimaryOAuthSettings environmentId={environmentId} />
  ) : (
    <RemoteOAuthSettings environmentId={environmentId} />
  );
}

function PrimaryOAuthSettings({ environmentId }: { environmentId: EnvironmentId }) {
  const { data } = usePrimarySessionState();
  return data?.authenticated && data.scopes?.includes(AuthAccessWriteScope) ? (
    <OAuthConfiguration environmentId={environmentId} />
  ) : null;
}

function RemoteOAuthSettings({ environmentId }: { environmentId: EnvironmentId }) {
  const { data } = useEnvironmentSessionState(environmentId);
  return data?.authenticated && data.scopes?.includes(AuthAccessWriteScope) ? (
    <OAuthConfiguration environmentId={environmentId} />
  ) : null;
}

function OAuthConfiguration({ environmentId }: { environmentId: EnvironmentId }) {
  const query = serverEnvironment.clickUpOAuthConfig({ environmentId, input: {} });
  const result = useAtomValue(query);
  const data = Option.getOrNull(AsyncResult.value(result));
  const save = useAtomCommand(serverEnvironment.clickUpSaveOAuthConfig, { reportFailure: false });
  const clear = useAtomCommand(serverEnvironment.clickUpClearOAuthConfig, { reportFailure: false });
  const [expanded, setExpanded] = useState<boolean | null>(null);
  const [draft, setDraft] = useState<{ clientId: string; redirectUri: string } | null>(null);
  const [clientSecret, setClientSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const saving = useRef(false);
  const id = useId();
  const values = draft ?? {
    clientId: data?.clientId ?? "",
    redirectUri: data?.redirectUri || DEFAULT_REDIRECT_URI,
  };
  const isExpanded = expanded ?? data?.source === "none";
  const changedClientId = values.clientId.trim() !== data?.clientId;
  const needsSecret = !data?.hasClientSecret || changedClientId;

  function refresh() {
    appAtomRegistry.refresh(query);
    appAtomRegistry.refresh(serverEnvironment.clickUpConnection({ environmentId, input: {} }));
  }

  async function update(remove: boolean) {
    if (saving.current) return;
    saving.current = true;
    setBusy(true);
    setError(null);
    try {
      const response = remove
        ? await clear({ environmentId, input: {} })
        : await save({
            environmentId,
            input: {
              clientId: values.clientId.trim(),
              redirectUri: values.redirectUri.trim(),
              ...(clientSecret.trim() ? { clientSecret: clientSecret.trim() } : {}),
            },
          });
      if (response._tag !== "Success") {
        setError(
          remove
            ? "Could not remove the saved configuration. Please try again."
            : "Could not save the configuration. Check the values and try again.",
        );
        return;
      }
      setClientSecret("");
      setDraft(null);
      setExpanded(remove);
      refresh();
    } catch {
      setError("Could not update the OAuth configuration. Please try again.");
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-border p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-medium">ClickUp OAuth app</h3>
        {!isExpanded && (
          <Button variant="outline" size="sm" disabled={!data} onClick={() => setExpanded(true)}>
            Configure OAuth app
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Set up once for this environment. Saved credentials stay on its machine and survive app
        updates.
      </p>
      {AsyncResult.isFailure(result) && (
        <p role="alert" className="text-sm text-destructive">
          Could not load the OAuth configuration.
          <Button variant="link" size="sm" onClick={refresh}>
            Try again
          </Button>
        </p>
      )}
      {data && isExpanded && (
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            void update(false);
          }}
        >
          <div className="space-y-1.5">
            <label className="text-sm" htmlFor={`${id}-client`}>
              Client ID
            </label>
            <Input
              id={`${id}-client`}
              value={values.clientId}
              required
              disabled={busy}
              autoComplete="off"
              onChange={(event) => setDraft({ ...values, clientId: event.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm" htmlFor={`${id}-secret`}>
              Client Secret
            </label>
            <Input
              id={`${id}-secret`}
              type="password"
              value={clientSecret}
              disabled={busy}
              autoComplete="new-password"
              required={needsSecret}
              placeholder={
                data.hasClientSecret && changedClientId
                  ? "Enter the secret for the new Client ID"
                  : data.hasClientSecret
                    ? "Leave blank to keep the existing secret"
                    : "Enter Client Secret"
              }
              onChange={(event) => setClientSecret(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm" htmlFor={`${id}-redirect`}>
              Redirect URL
            </label>
            <Input
              id={`${id}-redirect`}
              type="url"
              value={values.redirectUri}
              required
              disabled={busy}
              autoComplete="off"
              onChange={(event) => setDraft({ ...values, redirectUri: event.target.value })}
            />
            <p className="text-xs text-muted-foreground">
              Register this exact URL in your ClickUp app.
            </p>
          </div>
          {data.source === "environment" && (
            <p className="text-xs text-muted-foreground">
              Currently using environment variables. Saving replaces them for this environment.
            </p>
          )}
          {data.source === "saved" && (
            <p className="text-xs text-muted-foreground">
              Removing the saved configuration keeps your connected account.
            </p>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            {data.source === "saved" && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => void update(true)}
              >
                Remove saved configuration
              </Button>
            )}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => {
                setClientSecret("");
                setDraft(null);
                setError(null);
                setExpanded(false);
              }}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={
                busy ||
                !values.clientId.trim() ||
                !values.redirectUri.trim() ||
                (needsSecret && !clientSecret.trim())
              }
            >
              {busy ? "Saving…" : "Save configuration"}
            </Button>
          </div>
        </form>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
