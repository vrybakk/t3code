import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/shell";
import type { ThreadId, WorkDelivery, WorkTrackingProject } from "@t3tools/contracts";
import { useEffect, useState } from "react";

import { Button } from "../ui/button";
import { Label } from "../ui/label";

export function WorkDeliveries({
  projects,
  threads,
  deliveries,
  pending,
  onMark,
  onReopen,
}: {
  readonly projects: ReadonlyArray<WorkTrackingProject>;
  readonly threads: ReadonlyArray<EnvironmentThreadShell>;
  readonly deliveries: ReadonlyArray<WorkDelivery>;
  readonly pending: boolean;
  readonly onMark: (
    trackingProjectId: WorkTrackingProject["id"],
    threadId: ThreadId | null,
  ) => Promise<boolean>;
  readonly onReopen: (id: WorkDelivery["id"]) => Promise<boolean>;
}) {
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const [threadId, setThreadId] = useState("");
  useEffect(() => {
    if (projects.some((project) => project.id === projectId)) return;
    setProjectId(projects[0]?.id ?? "");
    setThreadId("");
  }, [projectId, projects]);
  const selectedProject = projects.find((project) => project.id === projectId);
  const visibleThreads = threads.filter((thread) =>
    selectedProject?.t3ProjectIds.includes(thread.projectId),
  );
  return (
    <section className="rounded-lg border p-5" aria-labelledby="work-deliveries-heading">
      <h2 id="work-deliveries-heading" className="font-medium">
        Delivery cycles
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Reopening preserves the delivered cycle and starts a new open cycle.
      </p>
      {projects.length ? (
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <label className="grid gap-1.5">
            <Label htmlFor="work-delivery-project">Tracking project</Label>
            <select
              id="work-delivery-project"
              className="h-9 rounded-lg border bg-background px-3 text-sm"
              value={projectId}
              onChange={(event) => {
                setProjectId(event.target.value);
                setThreadId("");
              }}
            >
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1.5">
            <Label htmlFor="work-delivery-thread">Thread (optional)</Label>
            <select
              id="work-delivery-thread"
              className="h-9 rounded-lg border bg-background px-3 text-sm"
              value={threadId}
              onChange={(event) => setThreadId(event.target.value)}
            >
              <option value="">Project delivery</option>
              {visibleThreads.map((thread) => (
                <option key={thread.id} value={thread.id}>
                  {thread.title}
                </option>
              ))}
            </select>
          </label>
          <Button
            disabled={pending || !projectId}
            onClick={() =>
              void onMark(projectId as WorkTrackingProject["id"], (threadId as ThreadId) || null)
            }
          >
            Mark delivered
          </Button>
        </div>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">
          Tracking projects appear automatically when local T3 projects are available.
        </p>
      )}
      <div className="mt-4 space-y-2 text-sm">
        {deliveries.length === 0 ? (
          <p className="text-muted-foreground">No delivery cycles yet.</p>
        ) : (
          deliveries.map((delivery) => (
            <div
              key={delivery.id}
              className="flex flex-col items-start justify-between gap-3 rounded-md border p-3 sm:flex-row sm:items-center"
            >
              <span>
                {delivery.status} · {delivery.threadId ?? "Project delivery"} ·{" "}
                {delivery.updatedAt.slice(0, 10)}
              </span>
              {delivery.status === "delivered" ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() => void onReopen(delivery.id)}
                >
                  Reopen
                </Button>
              ) : (
                <span className="text-muted-foreground">Open cycle</span>
              )}
            </div>
          ))
        )}
      </div>
    </section>
  );
}
