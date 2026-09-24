import type { ClickUpTask } from "@t3tools/contracts";

const PRIORITIES = ["urgent", "high", "normal", "low"];
const DELIVERY_STATUSES = ["qa testing", "staging", "in production"];

export function taskPriorityRank(priority: string | null | undefined): number {
  const rank = PRIORITIES.indexOf(priority?.trim().toLowerCase() ?? "");
  return rank === -1 ? PRIORITIES.length : rank;
}

function localDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function dueDay(task: ClickUpTask): number {
  const day = task.dueDate ? localDay(new Date(Number(task.dueDate))) : NaN;
  return Number.isNaN(day) ? Infinity : day;
}

function dayLabel(day: number, now: Date): string {
  if (day === Infinity) return "No due date";
  const today = localDay(now);
  if (day === today) return "Today";
  if (day === new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime())
    return "Tomorrow";
  const date = new Date(day).toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  return day < today ? `Overdue · ${date}` : date;
}

export function groupSprintTasks(tasks: ReadonlyArray<ClickUpTask>, now = new Date()) {
  const sorted = tasks.toSorted(
    (a, b) => taskPriorityRank(a.priority) - taskPriorityRank(b.priority),
  );
  const statusOf = (task: ClickUpTask) => task.status.trim().toLowerCase();
  const delivery = DELIVERY_STATUSES.map((status) => ({
    label:
      status === "qa testing" ? "QA Testing" : status === "staging" ? "Staging" : "In Production",
    tasks: sorted.filter((task) => statusOf(task) === status),
  })).filter((group) => group.tasks.length > 0);
  const working = sorted
    .filter(
      (task) => statusOf(task) !== "code review" && !DELIVERY_STATUSES.includes(statusOf(task)),
    )
    .sort((a, b) => dueDay(a) - dueDay(b));
  const byDay = new Map<number, ClickUpTask[]>();
  for (const task of working) {
    const day = dueDay(task);
    const group = byDay.get(day);
    if (group) group.push(task);
    else byDay.set(day, [task]);
  }
  return {
    working,
    days: [...byDay].map(([day, tasks]) => ({ label: dayLabel(day, now), tasks })),
    review: sorted.filter((task) => statusOf(task) === "code review"),
    delivery,
    deliveryCount: delivery.reduce((count, group) => count + group.tasks.length, 0),
  };
}
