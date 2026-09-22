import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/shell";
import type { WorkTrackingProject } from "@t3tools/contracts";
import { Link } from "@tanstack/react-router";
import { Clock3Icon } from "lucide-react";
import { useEffect, useState } from "react";

import { formatWorkingDurationLabel, resolveWorkingStartedAt } from "../Sidebar.logic";

export function WorkRunningSessions({
  threads,
  projects,
  enabled,
}: {
  readonly threads: ReadonlyArray<EnvironmentThreadShell>;
  readonly projects: ReadonlyArray<WorkTrackingProject>;
  readonly enabled: boolean;
}) {
  const running = threads.filter(
    (thread) =>
      (thread.latestTurn === null || thread.latestTurn.completedAt === null) &&
      (thread.session?.status === "running" || thread.session?.status === "starting"),
  );
  const [now, setNow] = useState(Date.now);
  const hasRunning = running.length > 0;
  useEffect(() => {
    if (!hasRunning) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [hasRunning]);
  if (!hasRunning) return null;
  return (
    <section aria-label="Running agent sessions" className="mb-6 rounded-lg border p-4">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Clock3Icon className="size-4 text-sky-500" />
        Running agent sessions <span className="text-muted-foreground">{running.length}</span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Live elapsed time. Recorded when the turn ends; developer time is entered manually.
      </p>
      <div className="mt-3 max-h-48 space-y-2 overflow-y-auto">
        {running.map((thread) => {
          const project = projects.find((item) => item.t3ProjectIds.includes(thread.projectId));
          const start = resolveWorkingStartedAt(thread);
          const tracked = enabled && project?.trackingEnabled;
          return (
            <Link
              key={thread.id}
              to="/$environmentId/$threadId"
              params={{ environmentId: thread.environmentId, threadId: thread.id }}
              className="flex min-w-0 items-center justify-between gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
            >
              <div className="min-w-0">
                <p className="truncate font-medium">{thread.title}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {project?.name ?? "Project"} · {tracked ? "Tracking" : "Tracking off"}
                  {thread.hasPendingApprovals || thread.hasPendingUserInput
                    ? " · Waiting for you"
                    : ""}
                </p>
              </div>
              <span className="shrink-0 tabular-nums">
                {start ? formatWorkingDurationLabel(now - Date.parse(start)) : "Starting…"}
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
