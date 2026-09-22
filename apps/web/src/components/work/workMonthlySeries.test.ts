import { describe, expect, it } from "vite-plus/test";
import type { WorkTrackingProjectId } from "@t3tools/contracts";

import { buildWorkMonthlySeries, shiftWorkMonth, workMonthDays } from "./workMonthlySeries";

const first = "first" as WorkTrackingProjectId;
const second = "second" as WorkTrackingProjectId;

describe("monthly Work chart data", () => {
  it("fills every calendar day and keeps developer and agent metrics separate", () => {
    const totals = [
      {
        date: "2026-09-02",
        trackingProjectId: first,
        developerMs: 10,
        agentElapsedMs: 100,
        taskMs: 1,
      },
      {
        date: "2026-09-02",
        trackingProjectId: second,
        developerMs: 20,
        agentElapsedMs: 200,
        taskMs: 2,
      },
      {
        date: "2026-08-31",
        trackingProjectId: first,
        developerMs: 500,
        agentElapsedMs: 500,
        taskMs: 0,
      },
    ];
    const days = buildWorkMonthlySeries("2026-09", totals, "developerMs", [first, second]);
    expect(days).toHaveLength(30);
    expect(days[0]).toEqual({ date: "2026-09-01", total: 0, segments: [] });
    expect(days[1]).toEqual({
      date: "2026-09-02",
      total: 30,
      segments: [
        { projectId: first, value: 10 },
        { projectId: second, value: 20 },
      ],
    });
    expect(buildWorkMonthlySeries("2026-09", totals, "agentElapsedMs", [first])[1]?.total).toBe(
      100,
    );
    expect(buildWorkMonthlySeries("2026-09", totals, "taskMs", [first, second])[1]?.total).toBe(3);
  });

  it("aggregates duplicate daily rows and handles leap months and year navigation", () => {
    const entry = {
      date: "2024-02-29",
      trackingProjectId: first,
      developerMs: 20,
      agentElapsedMs: 0,
      taskMs: 0,
    };
    const days = buildWorkMonthlySeries("2024-02", [entry, entry], "developerMs", [first]);
    expect(days.at(-1)?.total).toBe(40);
    expect(workMonthDays("2024-02")).toHaveLength(29);
    expect(workMonthDays("2025-02")).toHaveLength(28);
    expect(shiftWorkMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftWorkMonth("2026-12", 1)).toBe("2027-01");
  });
});
