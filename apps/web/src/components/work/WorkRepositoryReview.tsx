import { useAtomValue } from "@effect/atom-react";
import * as Option from "effect/Option";
import { AsyncResult } from "effect/unstable/reactivity";
import type { EnvironmentId, WorkTrackingProject } from "@t3tools/contracts";
import { useState } from "react";

import { serverEnvironment } from "../../state/server";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";

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
        Repository review
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Repositories show involvement only; Work never splits tokens or time across them.
      </p>
      {result.waiting ? (
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
            className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm"
          >
            <div>
              <p className="font-medium break-all">{candidate.localRoot}</p>
              <p className="text-muted-foreground">
                Source T3 project: {candidate.sourceProjectId} ·{" "}
                {candidate.inclusion ?? "Not reviewed"}
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant={candidate.inclusion === "included" ? "default" : "outline"}
                disabled={pending}
                onClick={() =>
                  void onSave({
                    localRoot: candidate.localRoot,
                    inclusion: "included",
                    provenance: candidate.provenance ?? "discovered",
                  })
                }
              >
                Include
              </Button>
              <Button
                size="sm"
                variant={candidate.inclusion === "excluded" ? "default" : "outline"}
                disabled={pending}
                onClick={() =>
                  void onSave({
                    localRoot: candidate.localRoot,
                    inclusion: "excluded",
                    provenance: candidate.provenance ?? "discovered",
                  })
                }
              >
                Exclude
              </Button>
            </div>
          </div>
        ))}
      </div>
      {discovery?.truncated ? (
        <p className="mt-3 text-sm text-muted-foreground">
          Discovery reached its safe scan limit. Review the listed repositories or add one manually.
        </p>
      ) : null}
      <form className="mt-4 flex flex-wrap items-end gap-2" onSubmit={addManual}>
        <label className="grid min-w-64 flex-1 gap-1.5">
          <Label htmlFor="work-manual-repository">Manual local root</Label>
          <Input
            id="work-manual-repository"
            value={manualRoot}
            onChange={(event) => setManualRoot(event.target.value)}
            placeholder="/path/to/repository"
          />
        </label>
        <Button type="submit" disabled={pending}>
          Add repository
        </Button>
      </form>
      {error ? (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </section>
  );
}
