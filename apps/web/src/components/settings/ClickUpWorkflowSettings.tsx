import type { ClickUpWorkflowModels, EnvironmentId } from "@t3tools/contracts";
import { useRef, useState } from "react";
import { useEnvironmentSettings } from "../../hooks/useSettings";
import { formatEnvironmentQueryError } from "../../state/query";
import { serverEnvironment } from "../../state/server";
import { useAtomCommand } from "../../state/use-atom-command";
import { ClickUpWorkflowModelPicker } from "../clickup/ClickUpWorkflowModels";
import { Button } from "../ui/button";

export function ClickUpWorkflowSettings({ environmentId }: { environmentId: EnvironmentId }) {
  const defaults = useEnvironmentSettings(
    environmentId,
    (settings) => settings.clickUpWorkflowModels,
  );
  const [draft, setDraft] = useState<ClickUpWorkflowModels | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const saving = useRef(false);
  const update = useAtomCommand(serverEnvironment.updateSettings, { reportFailure: false });
  async function save() {
    if (!draft || saving.current) return;
    saving.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await update({
        environmentId,
        input: { patch: { clickUpWorkflowModels: draft } },
      });
      if (result._tag === "Success") setDraft(null);
      else {
        setError(
          `Could not save workflow models. ${formatEnvironmentQueryError(result.cause)} Your choices are still here.`,
        );
      }
    } catch (cause) {
      setError(
        `Could not save workflow models. ${cause instanceof Error ? cause.message : "Your choices are still here."}`,
      );
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  return (
    <div className="space-y-3 rounded-lg border border-border p-4">
      <h3 className="text-sm font-medium">Task workflow models</h3>
      <p className="text-xs text-muted-foreground">
        Defaults for this environment. Developers can override them when preparing a task thread.
      </p>
      <ClickUpWorkflowModelPicker
        environmentId={environmentId}
        value={draft ?? defaults}
        onChange={setDraft}
        disabled={busy}
      />
      {draft && (
        <div className="flex items-center gap-2">
          <Button size="sm" disabled={busy} onClick={() => void save()}>
            {busy ? "Saving…" : "Save defaults"}
          </Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => setDraft(null)}>
            Cancel
          </Button>
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
