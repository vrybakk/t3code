import type { ClickUpSprint } from "@t3tools/contracts";

export interface SprintDates {
  readonly id: string;
  readonly name: string;
  readonly startDate: string | null;
  readonly dueDate: string | null;
  readonly taskCount: number | null;
}

const timestamp = (value: string | null): number | null => {
  if (value === null || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export function selectSprintWindow(lists: ReadonlyArray<SprintDates>, now: number) {
  const sprints: ClickUpSprint[] = lists.map((list) => {
    const start = timestamp(list.startDate);
    const due = timestamp(list.dueDate);
    const state =
      start !== null && due !== null && due < start
        ? "unknown"
        : start !== null && start > now
          ? "upcoming"
          : due !== null && due < now
            ? "past"
            : start !== null && due !== null && start <= now && now <= due
              ? "active"
              : "unknown";
    return { ...list, state };
  });
  const past = sprints
    .filter((sprint) => sprint.state === "past")
    .sort((a, b) => timestamp(b.dueDate)! - timestamp(a.dueDate)!)
    .slice(0, 3)
    .toReversed();
  const active = sprints
    .filter((sprint) => sprint.state === "active")
    .sort((a, b) => timestamp(b.startDate)! - timestamp(a.startDate)!)[0];
  const upcoming = sprints
    .filter((sprint) => sprint.state === "upcoming")
    .sort((a, b) => timestamp(a.startDate)! - timestamp(b.startDate)!)[0];
  const selected = [...past, ...(active ? [active] : []), ...(upcoming ? [upcoming] : [])];
  return {
    sprints: selected.length > 0 ? selected : sprints.slice(0, 5),
    activeSprintId: active?.id ?? null,
  };
}
