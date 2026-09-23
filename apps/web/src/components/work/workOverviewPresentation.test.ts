import { describe, expect, it } from "vite-plus/test";
import { workTimeWindow } from "@t3tools/shared/workTimeWindow";
import { workOverviewDays, workRecordPresentation } from "./workOverviewPresentation";

describe("Work overview presentation", () => {
  it("uses civil dates across daylight saving and excludes the next period boundary", () => {
    const window = workTimeWindow("week", "Europe/Madrid", new Date("2026-03-29T12:00:00Z"));
    expect(workOverviewDays(window.since, window.until, "Europe/Madrid")).toEqual([
      "2026-03-23",
      "2026-03-24",
      "2026-03-25",
      "2026-03-26",
      "2026-03-27",
      "2026-03-28",
      "2026-03-29",
    ]);
    const today = workTimeWindow("today", "Pacific/Auckland", new Date("2026-09-22T23:00:00Z"));
    expect(workOverviewDays(today.since, today.until, "Pacific/Auckland")).toEqual(["2026-09-23"]);
  });
  it("shows meaningful manual text without provider or model placeholders", () => {
    expect(
      workRecordPresentation({
        kind: "manual",
        category: "Review",
        note: "Checked release",
        durationMs: 60000,
      } as never),
    ).toEqual({ title: "Review", detail: "Checked release", duration: 60000 });
    expect(
      workRecordPresentation({
        kind: "agent-task",
        provider: "codex",
        model: null,
        outcome: "succeeded",
        taskMs: null,
      } as never),
    ).toEqual({ title: "Agent task", detail: "codex · succeeded", duration: null });
  });
});
