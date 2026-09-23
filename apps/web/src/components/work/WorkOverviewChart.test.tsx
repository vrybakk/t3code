import { WorkTrackingProjectId } from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { act, createElement } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { describe, expect, it } from "vite-plus/test";

import { buildWorkOverviewSeries, WorkOverviewChart } from "./WorkOverviewChart";

const totals = [
  {
    date: "2026-09-21",
    trackingProjectId: Schema.decodeSync(WorkTrackingProjectId)("one"),
    developerMs: 60_000,
    agentElapsedMs: 300_000,
    taskMs: 0,
  },
  {
    date: "2026-09-21",
    trackingProjectId: Schema.decodeSync(WorkTrackingProjectId)("two"),
    developerMs: 120_000,
    agentElapsedMs: 600_000,
    taskMs: 60_000,
  },
  {
    date: "2026-09-23",
    trackingProjectId: Schema.decodeSync(WorkTrackingProjectId)("one"),
    developerMs: 180_000,
    agentElapsedMs: 0,
    taskMs: 120_000,
  },
];

describe("WorkOverviewChart", () => {
  it("combines manual and agent work across projects, excludes overlapping tasks, and fills gaps", () => {
    expect(buildWorkOverviewSeries(["2026-09-21", "2026-09-22"], totals)).toEqual([
      {
        date: "2026-09-21",
        value: 1_080_000,
        manualMs: 180_000,
        agentElapsedMs: 900_000,
        taskMs: 60_000,
      },
      { date: "2026-09-22", value: 0, manualMs: 0, agentElapsedMs: 0, taskMs: 0 },
    ]);
  });

  it("exposes a daily total when focused and clears it on blur", () => {
    let renderer: ReactTestRenderer;
    act(() => {
      renderer = create(
        createElement(WorkOverviewChart, {
          days: ["2026-09-21", "2026-09-22"],
          dailyTotals: totals,
        }),
      );
    });
    const day = renderer!.root.findAllByType("g")[0]!;
    act(() => day.props.onFocus());
    expect(renderer!.root.findByProps({ "aria-live": "polite" }).children.join("")).toContain(
      "Total 18m · Manual 3m · Agent 15m · Tasks 1m (not added to total)",
    );
    act(() => day.props.onBlur());
    expect(renderer!.root.findByProps({ "aria-live": "polite" }).children.join("")).toBe(
      "Hover or focus a day to see its total.",
    );
    act(() => day.props.onPointerEnter());
    expect(renderer!.root.findByProps({ "aria-live": "polite" }).children.join("")).toContain(
      "Total 18m · Manual 3m · Agent 15m · Tasks 1m (not added to total)",
    );
    act(() => renderer!.root.findByType("svg").props.onPointerLeave());
    expect(renderer!.root.findByProps({ "aria-live": "polite" }).children.join("")).toBe(
      "Hover or focus a day to see its total.",
    );
  });

  it("shows today's full aggregated total without requiring hover or inventing hourly data", () => {
    let renderer: ReactTestRenderer;
    act(() => {
      renderer = create(
        createElement(WorkOverviewChart, {
          days: ["2026-09-21"],
          dailyTotals: totals,
        }),
      );
    });
    const summary = () => renderer!.root.findByProps({ "aria-live": "polite" }).children.join("");
    const day = renderer!.root.findByType("g");
    expect(summary()).toContain("Total 18m");
    expect(day.props["aria-label"]).toBe("2026-09-21: 18m total recorded work");
    expect(renderer!.root.findAllByType("circle")).toHaveLength(0);
    const bar = day.findAllByType("rect").find((node) => node.props.fill === "currentColor");
    expect(bar?.props.height).toBeGreaterThan(0);
    act(() => day.props.onFocus());
    expect(summary()).toContain("Total 18m");
    act(() => day.props.onBlur());
    expect(summary()).toContain("Total 18m");
    act(() => day.props.onPointerEnter());
    expect(summary()).toContain("Total 18m");
    act(() => renderer!.root.findByType("svg").props.onPointerLeave());
    expect(summary()).toContain("Total 18m");
  });

  it("shows an honest empty-period message", () => {
    let renderer: ReactTestRenderer;
    act(() => {
      renderer = create(
        createElement(WorkOverviewChart, {
          days: [],
          dailyTotals: [],
        }),
      );
    });
    expect(renderer!.root.findByProps({ "aria-live": "polite" }).children.join("")).toBe(
      "No work recorded in this period.",
    );
  });
});
