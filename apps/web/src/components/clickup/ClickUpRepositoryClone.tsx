import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import type {
  ClickUpRepositoryLink,
  ClickUpTask,
  EnvironmentId,
  ProjectId,
} from "@t3tools/contracts";
import { useId, useRef, useState } from "react";
import { useEnvironmentSettings } from "../../hooks/useSettings";
import { newProjectId } from "../../lib/utils";
import { useServerConfigs } from "../../state/entities";
import { useEnvironmentProjectClones, useProjectClone } from "../../state/projectClones";
import { sourceControlEnvironment } from "../../state/sourceControl";
import { serverEnvironment } from "../../state/server";
import { useAtomCommand } from "../../state/use-atom-command";
import { useAtomQueryRunner } from "../../state/use-atom-query-runner";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import {
  clickUpSourceKey,
  githubRepositoryName,
  repositoryKey,
  resolveClickUpMapping,
} from "./projectMappings";

export function ClickUpRepositoryClone({
  task,
  environmentId,
  repository,
}: {
  task: ClickUpTask;
  environmentId: EnvironmentId;
  repository: ClickUpRepositoryLink;
}) {
  const destinationInputId = useId();
  const repositories = useEnvironmentSettings(
    environmentId,
    (settings) => settings.clickUpRepositoryMappings,
  );
  const mappings = useEnvironmentSettings(
    environmentId,
    (settings) => settings.clickUpProjectMappings,
  );
  const clones = useEnvironmentProjectClones(environmentId);
  const existing = clones.find(
    (clone) => repositoryKey(clone.remoteUrl) === repositoryKey(repository.remoteUrl),
  );
  const [createdId, setCreatedId] = useState<ProjectId | null>(null);
  const projectId = createdId ?? existing?.projectId ?? repository.projectId ?? null;
  const clone = useProjectClone(projectId ? scopeProjectRef(environmentId, projectId) : null);
  const [sawClone, setSawClone] = useState(false);
  if (clone && !sawClone) setSawClone(true);
  const trackingLost = sawClone && !clone;
  const [checked, setChecked] = useState(false);
  const [destination, setDestination] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsSave, setNeedsSave] = useState(false);
  const inFlight = useRef(false);
  const lookup = useAtomQueryRunner(sourceControlEnvironment.repository, {
    reportFailure: false,
    refresh: true,
  });
  const start = useAtomCommand(sourceControlEnvironment.startProjectClone, {
    reportFailure: false,
  });
  const retry = useAtomCommand(sourceControlEnvironment.retryProjectClone, {
    reportFailure: false,
  });
  const update = useAtomCommand(serverEnvironment.updateSettings, { reportFailure: false });
  const capabilities = useServerConfigs().get(environmentId)?.environment.capabilities;
  const supported =
    capabilities?.projectCloneTracking === true && capabilities.clickUpRepositorySetup === true;
  const name = githubRepositoryName(repository.remoteUrl);
  async function saveBinding(id: ProjectId) {
    const scopes = (resolveClickUpMapping(task, mappings, repositories)?.sources ?? []).filter(
      (source) =>
        repositories[clickUpSourceKey(task.workspaceId, source)]?.some(
          (link) => repositoryKey(link.remoteUrl) === repositoryKey(repository.remoteUrl),
        ),
    );
    const patch = Object.fromEntries(
      scopes.map((source) => {
        const key = clickUpSourceKey(task.workspaceId, source);
        return [
          key,
          (repositories[key] ?? []).map((link) =>
            repositoryKey(link.remoteUrl) === repositoryKey(repository.remoteUrl)
              ? { ...link, projectId: id }
              : link,
          ),
        ];
      }),
    );
    const localPatch = Object.fromEntries(
      scopes.map((source) => {
        const key = clickUpSourceKey(task.workspaceId, source);
        const oldIds = new Set(
          (repositories[key] ?? [])
            .filter((link) => repositoryKey(link.remoteUrl) === repositoryKey(repository.remoteUrl))
            .map((link) => link.projectId),
        );
        return [key, (mappings[key] ?? []).filter((existingId) => !oldIds.has(existingId))];
      }),
    );
    const result = await update({
      environmentId,
      input: { patch: { clickUpRepositoryMappings: patch, clickUpProjectMappings: localPatch } },
    });
    setNeedsSave(result._tag === "Failure");
    if (result._tag === "Failure")
      setError("The download started, but its link could not be saved. Retry saving the link.");
  }
  async function run(action: "check" | "clone" | "retry" | "save") {
    if (inFlight.current || !name) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      if (action === "check") {
        const result = await lookup({
          environmentId,
          input: { provider: "github", repository: name },
        });
        if (result._tag === "Success") setChecked(true);
        else
          setError(
            "Cannot access this repository. Check the GitHub sign-in and repository access on this environment, then try again.",
          );
      } else if (action === "save" && projectId) {
        await saveBinding(projectId);
      } else if (action === "retry" && projectId) {
        const result = await retry({ environmentId, input: { projectId } });
        if (result._tag === "Failure")
          setError("Could not retry the download. Check repository access and the destination.");
      } else if (action === "clone" && checked && destination.trim() && !existing && !createdId) {
        if (!/^(?:\/|[A-Za-z]:[\\/]|~[\\/])/.test(destination.trim())) {
          setError("Choose an absolute folder path on this environment.");
          return;
        }
        const id = newProjectId();
        const result = await start({
          environmentId,
          input: {
            projectId: id,
            title: name.split("/").at(-1)!,
            createdAt: new Date().toISOString(),
            provider: "github",
            repository: name,
            destinationPath: destination.trim(),
          },
        });
        if (result._tag === "Failure") {
          setError(
            "Could not start the download. Check that the destination is an absolute path to an empty folder.",
          );
          return;
        }
        setCreatedId(id);
        await saveBinding(id);
      }
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  return (
    <div className="space-y-2 rounded-md border border-border p-3 text-sm">
      <p className="break-all font-medium">{name ?? repository.remoteUrl}</p>
      {clone?.phase === "running" ? (
        <p role="status" className="text-muted-foreground">
          Downloading… {clone.percent == null ? "" : `${clone.percent}%`} · {clone.destinationPath}
        </p>
      ) : clone?.phase === "failed" || clone?.phase === "cancelled" ? (
        <>
          <p role="alert" className="text-destructive">
            {clone.error ?? "Download cancelled."}
          </p>
          <Button size="sm" disabled={busy} onClick={() => void run("retry")}>
            Retry download
          </Button>
        </>
      ) : trackingLost ? (
        <div className="space-y-2">
          <p role="status">
            Download status is no longer available. Refresh the task to check the repository, or
            choose another empty location.
          </p>
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => {
              setCreatedId(null);
              setSawClone(false);
              setChecked(false);
              setDestination("");
              setNeedsSave(false);
              setError(null);
            }}
          >
            Set up again
          </Button>
        </div>
      ) : clone?.phase === "done" || createdId ? (
        <p role="status">Waiting for the repository to become available…</p>
      ) : !supported ? (
        <p>Update this environment to download repositories here.</p>
      ) : !name ? (
        <p>Add this repository to Nerd using the project picker, then link it here.</p>
      ) : !checked ? (
        <Button size="sm" variant="outline" disabled={busy} onClick={() => void run("check")}>
          {busy ? "Checking access…" : "Set up repository"}
        </Button>
      ) : (
        <div className="space-y-2">
          <label className="block text-xs" htmlFor={destinationInputId}>
            Download location on this environment
          </label>
          <Input
            id={destinationInputId}
            value={destination}
            onChange={(event) => setDestination(event.target.value)}
            placeholder="Absolute folder path"
            disabled={busy}
          />
          <Button
            size="sm"
            disabled={busy || !destination.trim()}
            onClick={() => void run("clone")}
          >
            {busy ? "Starting…" : "Confirm location and download"}
          </Button>
        </div>
      )}
      {needsSave && (
        <Button size="sm" variant="outline" disabled={busy} onClick={() => void run("save")}>
          Retry saving link
        </Button>
      )}
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
