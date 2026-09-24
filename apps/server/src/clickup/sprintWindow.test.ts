import { describe, expect, it } from "vite-plus/test";
import { selectSprintWindow, type SprintDates } from "./sprintWindow.ts";

const sprint = (id: string, start: number | null, due: number | null): SprintDates => ({
  id,
  name: `Sprint ${id}`,
  startDate: start === null ? null : String(start),
  dueDate: due === null ? null : String(due),
  taskCount: 4,
});

describe("selectSprintWindow", () => {
  it("opens Sprint 103 from the company folder's API dates on September 24", () => {
    const result = selectSprintWindow(
      [
        sprint("901220226135", 1788148800000, 1788753599999),
        sprint("901220802389", 1788753600000, 1789358399999),
        sprint("901220802394", 1789358400000, 1789963199999),
        sprint("901220802407", 1789963200000, 1790567999999),
        sprint("901220802432", 1790568000000, 1791172799999),
      ],
      Date.UTC(2026, 8, 24, 12),
    );
    expect(result.activeSprintId).toBe("901220802407");
    expect(result.sprints.map(({ state }) => state)).toEqual([
      "past",
      "past",
      "past",
      "active",
      "upcoming",
    ]);
  });

  it("selects three most recent past sprints, current, and the next by actual dates", () => {
    const result = selectSprintWindow(
      [
        sprint("future-2", 70, 79),
        sprint("past-1", 10, 19),
        sprint("active", 50, 59),
        sprint("past-4", 40, 49),
        sprint("past-2", 20, 29),
        sprint("next", 60, 69),
        sprint("past-3", 30, 39),
      ],
      55,
    );
    expect(result.activeSprintId).toBe("active");
    expect(result.sprints.map(({ id }) => id)).toEqual([
      "past-2",
      "past-3",
      "past-4",
      "active",
      "next",
    ]);
    expect(result.sprints.map(({ state }) => state)).toEqual([
      "past",
      "past",
      "past",
      "active",
      "upcoming",
    ]);
  });

  it("does not label a gap or missing dates as an active sprint", () => {
    const result = selectSprintWindow([sprint("past", 1, 10), sprint("next", 30, 40)], 20);
    expect(result.activeSprintId).toBeNull();
    expect(result.sprints.map(({ state }) => state)).toEqual(["past", "upcoming"]);
    const unknown = selectSprintWindow(
      [sprint("missing", null, null), sprint("invalid", 30, 20)],
      25,
    );
    expect(unknown.activeSprintId).toBeNull();
    expect(unknown.sprints.every(({ state }) => state === "unknown")).toBe(true);
  });

  it("uses the latest started overlapping sprint and includes exact boundaries", () => {
    const lists = [sprint("older", 1, 30), sprint("newer", 10, 20)];
    expect(selectSprintWindow(lists, 10).activeSprintId).toBe("newer");
    expect(selectSprintWindow(lists, 20).activeSprintId).toBe("newer");
  });

  it("keeps incomplete and empty date values unknown and bounds undated results", () => {
    const result = selectSprintWindow(
      Array.from({ length: 8 }, (_, index) => ({
        ...sprint(String(index), null, null),
        startDate: "",
      })),
      20,
    );
    expect(result.activeSprintId).toBeNull();
    expect(result.sprints).toHaveLength(5);
    expect(result.sprints.every(({ state }) => state === "unknown")).toBe(true);
  });
});
