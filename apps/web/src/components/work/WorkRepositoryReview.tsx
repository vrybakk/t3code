import { useAtomValue } from "@effect/atom-react";
import * as Option from "effect/Option";
import { AsyncResult } from "effect/unstable/reactivity";
import type { EnvironmentId, WorkTrackingProject } from "@t3tools/contracts";
import { useState } from "react";

import { serverEnvironment } from "../../state/server";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Switch } from "../ui/switch";
import { WorkPath } from "./WorkPath";

export function WorkRepositoryReview({
  environmentId,
  project,
  pending,
  onSave,
}: {
  readonly environmentId: EnvironmentId;
  readonly project: WorkTrackingProject;
  readonly pending: boolean;
  readonly onSave: (input: {
    localRoot: string;
    inclusion: "included" | "excluded";
    provenance: "discovered" | "manual";
  }) => Promise<boolean>;
}) {
  const result = useAtomValue(
    serverEnvironment.workRepositoryDiscovery({
      environmentId,
      input: { trackingProjectId: project.id },
    }),
  );
  const discovery = Option.getOrNull(AsyncResult.value(result));
  const [manualRoot, setManualRoot] = useState("");
  const [error, setError] = useState("");
  const addManual = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!manualRoot.trim()) return setError("Local repository root is required.");
    setError("");
    if (
      await onSave({
        localRoot: manualRoot.trim(),
        inclusion: "included",
        provenance: "manual",
      })
    )
      setManualRoot("");
  };
  return (
    <section className="rounded-lg border p-5" aria-labelledby="work-repositories-heading">
      <h2 id="work-repositories-heading" className="font-medium">
        Repositories
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Included automatically. Excluding a repository removes its attribution, but keeps project
        time and tokens. Worktrees follow their repository.
      </p>
      {result.waiting && discovery === null ? (
        <p className="mt-3 text-sm text-muted-foreground">Scanning bound workspaces…</p>
      ) : null}
      {discovery?.candidates.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          No Git repositories found under the bound workspace roots.
        </p>
      ) : null}
      <div className="mt-3 space-y-2">
        {discovery?.candidates.map((candidate) => (
          <div
            key={candidate.localRoot}
            className="flex min-w-0 items-center justify-between gap-3 rounded-md border p-3 text-sm"
          >
            <div className="min-w-0 flex-1">
              <div className="font-medium">
                <WorkPath path={candidate.localRoot} />
              </div>
              <p className="text-xs text-muted-foreground">
                {candidate.inclusion === "excluded"
                  ? "Excluded from repository attribution"
                  : "Included"}
              </p>
            </div>
            <Switch
              aria-label={`Include ${candidate.localRoot}`}
              checked={candidate.inclusion !== "excluded"}
              disabled={pending}
              onCheckedChange={(checked) =>
                void onSave({
                  localRoot: candidate.localRoot,
                  inclusion: checked ? "included" : "excluded",
                  provenance: candidate.provenance ?? "discovered",
                })
              }
            />
          </div>
        ))}
      </div>
      {discovery?.truncated ? (
        <p className="mt-3 text-sm text-muted-foreground">
          Discovery reached its safe scan limit. Review the listed repositories or add one manually.
        </p>
      ) : null}
      <details className="mt-4 text-sm">
        <summary className="cursor-pointer text-muted-foreground">Add a missing repository</summary>
        <form className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={addManual}>
          <div className="grid min-w-0 flex-1 gap-1.5">
            <Label htmlFor="work-manual-repository">Manual local root</Label>
            <Input
              id="work-manual-repository"
              value={manualRoot}
              onChange={(event) => setManualRoot(event.target.value)}
              placeholder="/path/to/repository"
            />
          </div>
          <Button type="submit" disabled={pending}>
            Add repository
          </Button>
        </form>
      </details>
      {error ? (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </section>
  );
}
