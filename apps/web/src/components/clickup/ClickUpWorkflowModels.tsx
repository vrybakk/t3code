import type { ClickUpWorkflowModels as WorkflowModels, EnvironmentId } from "@t3tools/contracts";
import { createModelSelection } from "@t3tools/shared/model";
import { useEnvironmentSettings } from "../../hooks/useSettings";
import { getCustomModelOptionsByInstance } from "../../modelSelection";
import {
  applyProviderInstanceSettings,
  deriveProviderInstanceEntries,
  resolveDefaultProviderModelSelection,
  sortProviderInstanceEntries,
} from "../../providerInstances";
import { useEnvironment } from "../../state/environments";
import { EMPTY_SERVER_PROVIDERS } from "../../state/server";
import { ProviderModelPicker } from "../chat/ProviderModelPicker";
import { TraitsPicker } from "../chat/TraitsPicker";
import { Button } from "../ui/button";

const roles = ["research", "implementation", "review"] as const;

export function ClickUpWorkflowModelPicker({
  environmentId,
  value,
  onChange,
  disabled = false,
}: {
  environmentId: EnvironmentId;
  value: WorkflowModels;
  onChange: (value: WorkflowModels) => void;
  disabled?: boolean;
}) {
  const settings = useEnvironmentSettings(environmentId);
  const environment = useEnvironment(environmentId);
  const providers = environment?.serverConfig?.providers ?? EMPTY_SERVER_PROVIDERS;
  const fallback = resolveDefaultProviderModelSelection(providers, settings.defaultModelSelection);
  const entries = sortProviderInstanceEntries(
    applyProviderInstanceSettings(deriveProviderInstanceEntries(providers), settings),
  );
  return (
    <div className="w-full space-y-3">
      {roles.map((role) => {
        const selected = value[role];
        const selection = selected ?? fallback;
        const entry = entries.find((candidate) => candidate.instanceId === selection?.instanceId);
        const options = getCustomModelOptionsByInstance(
          settings,
          providers,
          selection?.instanceId,
          selection?.model,
        );
        return (
          <div key={role} className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm capitalize">{role}</span>
            <div className="flex flex-wrap items-center gap-1">
              {selection ? (
                <ProviderModelPicker
                  activeInstanceId={selection.instanceId}
                  model={selection.model}
                  lockedProvider={null}
                  instanceEntries={entries}
                  modelOptionsByInstance={options}
                  triggerAriaLabel={`${role} model`}
                  {...(!selected ? { triggerLabel: "Use lead model" } : {})}
                  disabled={disabled}
                  onInstanceModelChange={(instanceId, model) =>
                    onChange({ ...value, [role]: createModelSelection(instanceId, model) })
                  }
                />
              ) : (
                <span className="text-xs text-muted-foreground">No models available</span>
              )}
              {selected && entry && (
                <TraitsPicker
                  provider={entry.driverKind}
                  models={entry.models}
                  model={selected.model}
                  prompt=""
                  onPromptChange={() => {}}
                  modelOptions={selected.options ?? []}
                  allowPromptInjectedEffort={false}
                  planModeEnabled={settings.planModeEnabled}
                  onModelOptionsChange={(modelOptions) => {
                    if (!disabled)
                      onChange({
                        ...value,
                        [role]: createModelSelection(
                          selected.instanceId,
                          selected.model,
                          modelOptions,
                        ),
                      });
                  }}
                />
              )}
              {selected && (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={disabled}
                  onClick={() => onChange({ ...value, [role]: null })}
                >
                  Use lead model
                </Button>
              )}
            </div>
          </div>
        );
      })}
      <p className="text-xs text-muted-foreground">
        Roles inherit the lead model unless selected here. If a provider cannot use a selected model
        or an independent reviewer, the agent asks how to proceed.
      </p>
    </div>
  );
}
