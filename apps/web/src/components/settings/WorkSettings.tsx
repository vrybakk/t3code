import type { EnvironmentId, WorkTrackingProject } from "@t3tools/contracts";
import { useState } from "react";

import { useWorkMutations } from "../../state/workTracking";
import { useWorkData } from "../work/useWorkData";
import { WorkBackupActions } from "../work/WorkBackupActions";
import { WorkProfileForm } from "../work/WorkProfileForm";
import { WorkRepositoryReview } from "../work/WorkRepositoryReview";
import { WorkSelect } from "../work/WorkSelect";
import { useSettingsScope } from "./SettingsScopeContext";
import { SettingsScopeNotice } from "./SettingsScopeNotice";
import { SettingsPageContainer, SettingsSearchTarget, SettingsSection } from "./settingsLayout";

export function WorkSettingsPanel() {
  const { scope, connectedEnvironments } = useSettingsScope();
  if (scope.kind !== "environment") {
    return (
      <SettingsScopeNotice target="environment">
        Choose one environment to manage its Work profile, tracking, and backups. These settings
        apply to that environment, not to individual projects or all machines at once.
      </SettingsScopeNotice>
    );
  }
  if (!connectedEnvironments.some((entry) => entry.environmentId === scope.environmentId)) {
    return (
      <SettingsPageContainer>
        <p role="status" className="text-sm text-muted-foreground">
          Reconnect {scope.label} to manage its Work settings.
        </p>
      </SettingsPageContainer>
    );
  }
  return <EnvironmentWorkSettings key={scope.environmentId} environmentId={scope.environmentId} />;
}

function EnvironmentWorkSettings({ environmentId }: { readonly environmentId: EnvironmentId }) {
  const { overview, timeZone, loading } = useWorkData(environmentId);
  const mutations = useWorkMutations(environmentId);
  const [selectedId, setSelectedId] = useState<WorkTrackingProject["id"] | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const selected =
    overview?.projects.find((project) => project.id === selectedId) ??
    overview?.projects[0] ??
    null;
  const perform = async <T extends { readonly _tag: string }>(operation: () => Promise<T>) => {
    setPending(true);
    setError("");
    try {
      const response = await operation();
      if (response._tag === "Success") return response;
      setError("Could not save this Work change. Check the environment connection and try again.");
      return null;
    } finally {
      setPending(false);
    }
  };
  return (
    <SettingsPageContainer>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {!overview ? (
        <p role="status" className="text-sm text-muted-foreground">
          {loading ? "Loading Work settings…" : "Work is unavailable for this environment."}
        </p>
      ) : (
        <>
          <SettingsSearchTarget id="work-profile">
            <WorkProfileForm
              key={overview.profile?.id ?? "onboarding"}
              profile={overview.profile}
              pending={pending}
              onSave={async (input) => {
                await perform(() => mutations.saveProfile(input));
              }}
            />
          </SettingsSearchTarget>
          <SettingsSection id="work-tracking" title="Tracking settings" variant="plain">
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Projects are added automatically when tracking is enabled. Repositories include
                their worktrees. Excluding a repository changes attribution, not time capture.
              </p>
              {overview.projects.length > 1 ? (
                <div className="grid min-w-0 max-w-md gap-1.5 text-sm font-medium">
                  <label htmlFor="work-settings-project">Tracking project</label>
                  <WorkSelect
                    id="work-settings-project"
                    value={selected?.id ?? ""}
                    onValueChange={(value) => setSelectedId(value as WorkTrackingProject["id"])}
                    options={overview.projects.map((project) => ({
                      value: project.id,
                      label: project.name,
                    }))}
                  />
                </div>
              ) : null}
              {selected ? (
                <WorkRepositoryReview
                  environmentId={environmentId}
                  project={selected}
                  pending={pending}
                  onSave={async (input) =>
                    (await perform(() =>
                      mutations.saveRepository({ trackingProjectId: selected.id, ...input }),
                    )) !== null
                  }
                />
              ) : (
                <p className="text-sm text-muted-foreground">
                  Tracking projects appear automatically for this environment's T3 projects.
                </p>
              )}
            </div>
          </SettingsSection>
          <SettingsSearchTarget id="work-backup">
            <WorkBackupActions
              pending={pending}
              onExport={async () => {
                const result = await mutations.exportJson();
                if (result._tag === "Success") return result.value;
                setError("Could not export the JSON backup.");
                return null;
              }}
              onImport={async (backup) =>
                (await perform(() => mutations.importJson({ mode: "merge", backup }))) !== null
              }
            />
          </SettingsSearchTarget>
          <p className="text-xs text-muted-foreground">
            Reporting timezone: {timeZone}. Active and waiting time remain unavailable when provider
            events do not supply them.
          </p>
        </>
      )}
    </SettingsPageContainer>
  );
}
