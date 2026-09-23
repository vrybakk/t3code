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
  it("aggregates all projects by selected day and fills gaps without adding time measures", () => {
    expect(buildWorkOverviewSeries(["2026-09-21", "2026-09-22"], totals, "developerMs")).toEqual([
      { date: "2026-09-21", value: 180_000 },
      { date: "2026-09-22", value: 0 },
    ]);
    expect(buildWorkOverviewSeries(["2026-09-21"], totals, "agentElapsedMs")[0]?.value).toBe(
      900_000,
    );
    expect(buildWorkOverviewSeries(["2026-09-21"], totals, "taskMs")[0]?.value).toBe(60_000);
  });

  it("exposes a daily total when focused and clears it on blur", () => {
    let renderer: ReactTestRenderer;
    act(() => {
      renderer = create(
        createElement(WorkOverviewChart, {
          days: ["2026-09-21"],
          dailyTotals: totals,
          metric: "developerMs",
          label: "Developer time",
        }),
      );
    });
    const day = renderer!.root.findByType("g");
    act(() => day.props.onFocus());
    expect(renderer!.root.findByProps({ "aria-live": "polite" }).children.join("")).toContain(
      "3m developer time",
    );
    act(() => day.props.onBlur());
    expect(renderer!.root.findByProps({ "aria-live": "polite" }).children.join("")).toBe(
      "Hover or focus a day to see its total.",
    );
  });

  it("shows an honest empty-period message", () => {
    let renderer: ReactTestRenderer;
    act(() => {
      renderer = create(
        createElement(WorkOverviewChart, {
          days: [],
          dailyTotals: [],
          metric: "developerMs",
          label: "Developer time",
        }),
      );
    });
    expect(renderer!.root.findByProps({ "aria-live": "polite" }).children.join("")).toBe(
      "No developer time recorded in this period.",
    );
  });
});
