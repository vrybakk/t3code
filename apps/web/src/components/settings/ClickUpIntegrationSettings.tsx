import { ClickUpWorkflowSettings } from "./ClickUpWorkflowSettings";
import { ClickUpConnectionCard } from "../clickup/ClickUpConnectionCard";
import { SettingsSection } from "./settingsLayout";
import { useSettingsScope } from "./SettingsScopeContext";

export function ClickUpIntegrationSettings() {
  const { scope, environment } = useSettingsScope();
  return (
    <SettingsSection id="clickup" title="ClickUp">
      {scope.kind !== "environment" ? (
        <p className="text-sm text-muted-foreground">
          Select one environment to manage its ClickUp account.
        </p>
      ) : environment?.connection.phase !== "connected" ? (
        <p className="text-sm text-muted-foreground">
          Connect to this environment to manage ClickUp.
        </p>
      ) : environment.serverConfig?.environment.capabilities.clickUpTasks !== true ? (
        <p className="text-sm text-muted-foreground">
          Update this environment to use ClickUp tasks.
        </p>
      ) : (
        <div className="space-y-4">
          <ClickUpConnectionCard
            key={environment.environmentId}
            environmentId={environment.environmentId}
          />
          <ClickUpWorkflowSettings
            key={`models-${environment.environmentId}`}
            environmentId={environment.environmentId}
          />
        </div>
      )}
    </SettingsSection>
  );
}
