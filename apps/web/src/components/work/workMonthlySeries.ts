import type { WorkOverview, WorkTrackingProjectId } from "@t3tools/contracts";

export type WorkMonthlyMetric = "developerMs" | "agentElapsedMs" | "taskMs";

export interface WorkDayColumn {
  readonly date: string;
  readonly total: number;
  readonly segments: ReadonlyArray<{
    readonly projectId: WorkTrackingProjectId;
    readonly value: number;
  }>;
}

export function workMonthDays(month: string): ReadonlyArray<string> {
  const [year = 0, monthNumber = 1] = month.split("-").map(Number);
  const count = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return Array.from(
    { length: count },
    (_, index) => `${month}-${String(index + 1).padStart(2, "0")}`,
  );
}

export function shiftWorkMonth(month: string, offset: number): string {
  const [year = 0, monthNumber = 1] = month.split("-").map(Number);
  return new Date(Date.UTC(year, monthNumber - 1 + offset, 15)).toISOString().slice(0, 7);
}

export function buildWorkMonthlySeries(
  month: string,
  totals: NonNullable<WorkOverview["dailyTotals"]>,
  metric: WorkMonthlyMetric,
  projectIds: ReadonlyArray<WorkTrackingProjectId>,
): ReadonlyArray<WorkDayColumn> {
  const byDay = new Map<string, Map<WorkTrackingProjectId, number>>();
  const included = new Set(projectIds);
  for (const entry of totals) {
    if (!included.has(entry.trackingProjectId)) continue;
    const projects = byDay.get(entry.date) ?? new Map<WorkTrackingProjectId, number>();
    projects.set(
      entry.trackingProjectId,
      (projects.get(entry.trackingProjectId) ?? 0) + entry[metric],
    );
    byDay.set(entry.date, projects);
  }
  return workMonthDays(month).map((date) => {
    const values = byDay.get(date);
    const segments = projectIds
      .map((projectId) => ({ projectId, value: values?.get(projectId) ?? 0 }))
      .filter((segment) => segment.value > 0);
    return { date, segments, total: segments.reduce((sum, segment) => sum + segment.value, 0) };
  });
}

export function formatWorkDuration(milliseconds: number): string {
  if (milliseconds > 0 && milliseconds < 60_000) return "<1m";
  const minutes = Math.round(milliseconds / 60_000);
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h${minutes % 60 ? ` ${minutes % 60}m` : ""}`;
}

const PROJECT_COLORS = [
  "var(--color-sky-500)",
  "var(--color-violet-500)",
  "var(--color-emerald-500)",
  "var(--color-amber-500)",
  "var(--color-pink-500)",
  "var(--color-cyan-500)",
] as const;

export const workProjectColor = (index: number) => PROJECT_COLORS[index % PROJECT_COLORS.length];
