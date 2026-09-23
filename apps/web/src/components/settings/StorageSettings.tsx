import type { StorageCleanupSettings, WorktreeCleanupRules } from "@t3tools/contracts";
import { resolveWorktreeCleanup } from "@t3tools/shared/projectSettings";
import { useState } from "react";
import { Tabs } from "@base-ui/react/tabs";

import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { Switch } from "../ui/switch";
import {
  NumberField,
  NumberFieldDecrement,
  NumberFieldGroup,
  NumberFieldIncrement,
  NumberFieldInput,
} from "../ui/number-field";
import { SettingsPageContainer, SettingsRow, SettingsSection } from "./settingsLayout";
import { Button } from "../ui/button";
import { StorageUsagePanel } from "./StorageUsagePanel";
import { toggleVariants } from "../ui/toggle";
import type { ScopedSettingsTarget } from "./scopedSettings";
import { useSettingsScope } from "./SettingsScopeContext";
import {
  useClearScopedSettings,
  useScopedSettings,
  useUpdateScopedSettings,
} from "./useScopedSettings";

function RetentionControl({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
}) {
  const [draft, setDraft] = useState(value);
  const [savedValue, setSavedValue] = useState(value);
  if (savedValue !== value) {
    setSavedValue(value);
    setDraft(value);
  }

  return (
    <div className="flex items-center gap-3">
      {value !== null ? (
        <NumberField
          value={draft}
          min={1}
          max={3650}
          step={1}
          size="sm"
          className="w-auto"
          onValueChange={setDraft}
          onValueCommitted={(next) => {
            if (next === null) setDraft(value);
            else {
              const days = Math.min(3650, Math.max(1, Math.round(next)));
              setDraft(days);
              onChange(days);
            }
          }}
        >
          <NumberFieldGroup>
            <NumberFieldDecrement aria-label={`Decrease ${label}`} />
            <NumberFieldInput
              aria-label={`${label} in days`}
              size={new Intl.NumberFormat().format(draft ?? value).length}
              className="field-sizing-content w-auto min-w-[1ch] grow-0 text-right in-data-[size=sm]:px-1"
            />
            <span aria-hidden="true" className="self-center pr-2 text-xs">
              days
            </span>
            <NumberFieldIncrement aria-label={`Increase ${label}`} />
          </NumberFieldGroup>
        </NumberField>
      ) : (
        <span className="text-xs text-muted-foreground">Off</span>
      )}
      <Switch
        aria-label={label}
        checked={value !== null}
        onCheckedChange={(enabled) => onChange(enabled ? 8 : null)}
      />
    </div>
  );
}

export function StorageSettingsPanel() {
  const [tab, setTab] = useState("usage");
  const [usageTab, setUsageTab] = useState<"overview" | "breakdown" | "histories">("overview");
  return (
    <SettingsPageContainer>
      <Tabs.Root
        value={tab}
        onValueChange={(value) => {
          if (typeof value === "string") setTab(value);
        }}
        className="space-y-6"
      >
        <Tabs.List
          aria-label="Storage sections"
          className="flex w-fit max-w-full flex-wrap gap-0.5 rounded-lg bg-input/40 p-0.5"
        >
          {[
            ["usage", "Usage"],
            ["settings", "Settings"],
          ].map(([value, label]) => (
            <Tabs.Tab
              key={value}
              value={value}
              id={`storage-tab-${value}`}
              aria-controls="storage-tab-panel"
              data-pressed={tab === value ? "" : undefined}
              className={toggleVariants({ variant: "segmented", size: "segmented" })}
            >
              {label}
            </Tabs.Tab>
          ))}
        </Tabs.List>
        <div role="tabpanel" id="storage-tab-panel" aria-labelledby={`storage-tab-${tab}`}>
          <div hidden={tab !== "usage"}>
            <Tabs.Root
              value={usageTab}
              onValueChange={(value) => {
                if (value === "overview" || value === "breakdown" || value === "histories")
                  setUsageTab(value);
              }}
              className="space-y-6"
            >
              <Tabs.List
                aria-label="Storage usage views"
                className="flex w-fit max-w-full flex-wrap gap-0.5 rounded-lg bg-input/40 p-0.5"
              >
                {[
                  ["overview", "Overview"],
                  ["breakdown", "Breakdown"],
                  ["histories", "Histories"],
                ].map(([value, label]) => (
                  <Tabs.Tab
                    key={value}
                    value={value}
                    id={`storage-usage-tab-${value}`}
                    aria-controls="storage-usage-tab-panel"
                    data-pressed={usageTab === value ? "" : undefined}
                    className={toggleVariants({ variant: "segmented", size: "segmented" })}
                  >
                    {label}
                  </Tabs.Tab>
                ))}
              </Tabs.List>
              <div
                role="tabpanel"
                id="storage-usage-tab-panel"
                aria-labelledby={`storage-usage-tab-${usageTab}`}
              >
                <StorageUsagePanel section={usageTab} />
              </div>
            </Tabs.Root>
          </div>
          <div hidden={tab !== "settings"} className="space-y-8">
            <StorageCleanupControls section="worktrees" />
            <StorageCleanupControls section="artifacts" />
          </div>
        </div>
      </Tabs.Root>
    </SettingsPageContainer>
  );
}

function StorageCleanupControls({ section }: { section: "worktrees" | "artifacts" }) {
  const { scope, connectedEnvironments, targets, target, selectScope } = useSettingsScope();
  const scopedSettings = useScopedSettings();
  const isProjectScope = scope.kind === "project" || scope.kind === "checkout";
  const settings = {
    ...scopedSettings.storageCleanup,
    ...resolveWorktreeCleanup(scopedSettings, null),
  };
  const projectMode = (entry: ScopedSettingsTarget | null) =>
    entry?.sources.worktreeCleanup === "project"
      ? (entry.settings.worktreeCleanup?.mode ?? "inherit")
      : "inherit";
  const mode = projectMode(target);
  const mixedModes = targets.some((entry) => projectMode(entry) !== mode);
  const updateSettings = useUpdateScopedSettings();
  const clearSettings = useClearScopedSettings();
  const ruleStatus = (key: keyof StorageCleanupSettings) =>
    targets.some(
      (target) =>
        ({ ...target.settings.storageCleanup, ...resolveWorktreeCleanup(target.settings, null) })[
          key
        ] !== settings[key],
    )
      ? "Mixed across selected machines"
      : undefined;
  const update = (patch: Partial<StorageCleanupSettings>) =>
    updateSettings({ storageCleanup: patch });
  const updateWorktree = (patch: Partial<WorktreeCleanupRules>) =>
    isProjectScope
      ? updateSettings({ worktreeCleanup: { mode: "custom", rules: patch } })
      : update(patch);

  if (section === "artifacts" && isProjectScope)
    return (
      <div className="space-y-3 px-4 text-sm text-muted-foreground">
        <p>Artifact and log cleanup rules apply to the whole machine, not an individual project.</p>
        <Button
          size="xs"
          variant="outline"
          onClick={() =>
            selectScope(
              scope.environmentIds.length === 1 ? { machine: scope.environmentIds[0] } : {},
            )
          }
        >
          Open machine settings
        </Button>
      </div>
    );

  if (
    isProjectScope &&
    connectedEnvironments.some(
      (environment) =>
        environment.serverConfig?.environment.capabilities.projectWorktreeCleanup !== true,
    )
  ) {
    return (
      <div className="space-y-3 px-4 text-sm text-muted-foreground" role="status">
        <p>Update the selected machines to configure project worktree cleanup.</p>
        <Button size="xs" variant="outline" onClick={() => selectScope({})}>
          Open all environments
        </Button>
      </div>
    );
  }

  if (
    connectedEnvironments.some(
      (environment) => environment.serverConfig?.environment.capabilities.storageCleanup !== true,
    )
  ) {
    return (
      <div className="space-y-3 px-4 text-sm text-muted-foreground" role="status">
        <p>
          Update the selected environments to use storage cleanup, or choose a machine that supports
          it.
        </p>
        <div className="flex flex-wrap gap-2">
          {connectedEnvironments
            .filter(
              (environment) =>
                environment.serverConfig?.environment.capabilities.storageCleanup === true,
            )
            .map((environment) => (
              <Button
                key={environment.environmentId}
                size="xs"
                variant="outline"
                onClick={() => selectScope({ machine: environment.environmentId })}
              >
                {environment.label}
              </Button>
            ))}
        </div>
      </div>
    );
  }

  return (
    <>
      {section === "worktrees" && (
        <SettingsSection id="storage-worktrees" title="Worktrees">
          {isProjectScope && (
            <SettingsRow
              title="Automatic worktree cleanup"
              description={
                mode === "off"
                  ? "Keep this project's worktrees until you delete them manually."
                  : mode === "custom"
                    ? "Use these rules for this project."
                    : "Use each machine's worktree cleanup settings."
              }
              serverScoped
              settingKeys={["worktreeCleanup"]}
              mixed={mixedModes}
              control={
                <Select
                  value={mixedModes ? null : mode}
                  onValueChange={(next) => {
                    if (next === "inherit") clearSettings(["worktreeCleanup"]);
                    else if (next === "off") updateSettings({ worktreeCleanup: { mode: "off" } });
                    else if (next === "custom")
                      updateSettings({ worktreeCleanup: { mode: "custom", rules: {} } });
                  }}
                >
                  <SelectTrigger size="sm" aria-label="Automatic worktree cleanup">
                    <SelectValue>
                      {mixedModes
                        ? "Mixed"
                        : mode === "inherit"
                          ? "Inherit"
                          : mode === "off"
                            ? "Off"
                            : "Custom"}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectPopup align="end" alignItemWithTrigger={false}>
                    <SelectItem value="inherit">Inherit</SelectItem>
                    <SelectItem value="off">Off</SelectItem>
                    <SelectItem value="custom">Custom</SelectItem>
                  </SelectPopup>
                </Select>
              }
            />
          )}
          {(!isProjectScope || (!mixedModes && mode === "custom")) && (
            <>
              <SettingsRow
                title="Delete worktrees with deleted threads"
                status={ruleStatus("worktreeOnDelete")}
                description="Remove unused worktrees when active or archived threads are deleted. Worktrees with local changes are kept."
                serverScoped={!isProjectScope}
                control={
                  <Switch
                    aria-label="Delete worktrees with deleted threads"
                    checked={settings.worktreeOnDelete}
                    onCheckedChange={(worktreeOnDelete) => updateWorktree({ worktreeOnDelete })}
                  />
                }
              />
              <SettingsRow
                title="Delete inactive worktrees"
                status={ruleStatus("worktreeAfterDays")}
                description="Remove worktrees after their threads have been inactive for this many days. Branches and thread history are kept."
                serverScoped={!isProjectScope}
                control={
                  <RetentionControl
                    label="Delete inactive worktrees"
                    value={settings.worktreeAfterDays}
                    onChange={(worktreeAfterDays) => updateWorktree({ worktreeAfterDays })}
                  />
                }
              />
              <SettingsRow
                title="Delete merged worktrees"
                status={ruleStatus("worktreeOnMerge")}
                description="Remove worktrees whose pull request is merged and whose commits are included in the default branch."
                serverScoped={!isProjectScope}
                control={
                  <Switch
                    aria-label="Delete merged worktrees"
                    checked={settings.worktreeOnMerge}
                    onCheckedChange={(worktreeOnMerge) => updateWorktree({ worktreeOnMerge })}
                  />
                }
              />
              <SettingsRow
                title="Delete unchanged worktrees"
                status={ruleStatus("worktreeUnchanged")}
                description="Remove worktrees with no commits beyond the default branch."
                serverScoped={!isProjectScope}
                control={
                  <Switch
                    aria-label="Delete unchanged worktrees"
                    checked={settings.worktreeUnchanged}
                    onCheckedChange={(worktreeUnchanged) => updateWorktree({ worktreeUnchanged })}
                  />
                }
              />
            </>
          )}
        </SettingsSection>
      )}

      {section === "artifacts" && !isProjectScope && (
        <SettingsSection id="storage-artifacts" title="Artifacts and logs">
          <SettingsRow
            title="Delete old browser artifacts"
            status={ruleStatus("browserArtifactsAfterDays")}
            description="Delete saved browser captures after this many days. Older capture links will no longer open."
            serverScoped
            control={
              <RetentionControl
                label="Delete old browser artifacts"
                value={settings.browserArtifactsAfterDays}
                onChange={(browserArtifactsAfterDays) => update({ browserArtifactsAfterDays })}
              />
            }
          />
          <SettingsRow
            title="Delete old rotated logs"
            status={ruleStatus("logsAfterDays")}
            description="Delete inactive rotated log files after this many days. Current logs are kept."
            serverScoped
            control={
              <RetentionControl
                label="Delete old rotated logs"
                value={settings.logsAfterDays}
                onChange={(logsAfterDays) => update({ logsAfterDays })}
              />
            }
          />
        </SettingsSection>
      )}
    </>
  );
}
