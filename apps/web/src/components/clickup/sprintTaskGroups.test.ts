import type { ClickUpTask } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";
import { groupSprintTasks } from "./sprintTaskGroups";

const task = (taskId: string, status: string, priority: string | null): ClickUpTask => ({
  taskId,
  status,
  priority,
  name: taskId,
  workspaceId: "42",
  listName: "Project",
  description: "",
});

describe("sprint task ordering", () => {
  it("groups by local due day before priority, with undated work last", () => {
    const dated = (id: string, day: number, hour: number, priority: string): ClickUpTask => ({
      ...task(id, "to do", priority),
      dueDate: String(new Date(2026, 8, day, hour).getTime()),
    });
    const groups = groupSprintTasks(
      [
        dated("tomorrow", 25, 4, "urgent"),
        dated("today-low", 24, 0, "low"),
        task("undated", "to do", "urgent"),
        dated("overdue", 23, 23, "normal"),
        dated("today-high", 24, 23, "high"),
        dated("future", 28, 4, "urgent"),
        { ...task("invalid-date", "to do", "low"), dueDate: "invalid" },
      ],
      new Date(2026, 8, 24, 15),
    );
    expect(groups.days.map((group) => group.tasks.map((task) => task.taskId))).toEqual([
      ["overdue"],
      ["today-high", "today-low"],
      ["tomorrow"],
      ["future"],
      ["undated", "invalid-date"],
    ]);
    expect(groups.days.map((group) => group.tasks.length)).toEqual([1, 2, 1, 1, 2]);
    expect(groups.days[0]?.label).toMatch(/^Overdue · /);
    expect(groups.days[1]?.label).toBe("Today");
    expect(groups.days[2]?.label).toBe("Tomorrow");
    expect(groups.days[4]?.label).toBe("No due date");
  });

  it("keeps review and delivery outside day groups even with an earlier due date", () => {
    const groups = groupSprintTasks([
      { ...task("review", "code review", "urgent"), dueDate: "1" },
      { ...task("qa", "qa testing", "urgent"), dueDate: "1" },
      task("active", "in progress", "low"),
    ]);
    expect(groups.days.map((group) => group.tasks.map((task) => task.taskId))).toEqual([
      ["active"],
    ]);
    expect(groups.review.map((task) => task.taskId)).toEqual(["review"]);
    expect(groups.delivery[0]?.tasks.map((task) => task.taskId)).toEqual(["qa"]);
  });

  it("labels tomorrow across the daylight-saving transition using calendar dates", () => {
    const dueDate = String(new Date(2026, 9, 26, 4).getTime());
    const groups = groupSprintTasks(
      [{ ...task("tomorrow", "to do", null), dueDate }],
      new Date(2026, 9, 25, 1),
    );
    expect(groups.days[0]?.label).toBe("Tomorrow");
  });

  it("orders working tasks by priority and keeps code review last regardless of priority", () => {
    const tasks = [
      task("unset", "backlog", null),
      task("review", "CODE REVIEW", "urgent"),
      task("low", "in progress", "low"),
      task("normal", "to do", "normal"),
      task("high", "requires adjustments", "high"),
      task("urgent", "to do", "urgent"),
    ];
    const groups = groupSprintTasks(tasks);
    expect(groups.working.map((task) => task.taskId)).toEqual([
      "urgent",
      "high",
      "normal",
      "low",
      "unset",
    ]);
    expect(groups.review.map((task) => task.taskId)).toEqual(["review"]);
    expect(tasks[0]?.taskId).toBe("unset");
  });

  it("groups delivery statuses in workflow order and sorts priority within each", () => {
    const groups = groupSprintTasks([
      task("production-urgent", "In production", "urgent"),
      task("staging", "STAGING", "high"),
      task("qa-low", "QA Testing", "low"),
      task("qa-urgent", " qa testing ", "URGENT"),
      task("production-low", "in production", "low"),
    ]);
    expect(groups.working).toEqual([]);
    expect(
      groups.delivery.map((group) => [group.label, group.tasks.map((task) => task.taskId)]),
    ).toEqual([
      ["QA Testing", ["qa-urgent", "qa-low"]],
      ["Staging", ["staging"]],
      ["In Production", ["production-urgent", "production-low"]],
    ]);
    expect(groups.deliveryCount).toBe(5);
  });

  it("keeps other statuses visible, preserves equal-priority order, and omits empty groups", () => {
    const groups = groupSprintTasks([
      task("a", "ready", "high"),
      task("b", "complete", "high"),
      task("c", "custom status", "unknown"),
    ]);
    expect(groups.working.map((task) => task.taskId)).toEqual(["a", "b", "c"]);
    expect(groups.delivery).toEqual([]);
    expect(groups.deliveryCount).toBe(0);
  });
});
