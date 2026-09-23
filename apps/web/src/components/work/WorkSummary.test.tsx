import type { WorkOverview } from "@t3tools/contracts";
import { act, createElement } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { describe, expect, it } from "vite-plus/test";

import { WorkSummary } from "./WorkSummary";

const overview: WorkOverview = {
  profile: null,
  totals: {
    manualMs: 3_600_000,
    agentElapsedMs: 7_200_000,
    agentTaskMs: 1_800_000,
    agentActiveMs: 0,
    agentWaitingMs: 0,
    inputTokens: 1_000,
    cachedInputTokens: 200,
    outputTokens: 300,
    reasoningTokens: 40,
    toolUses: 5,
    records: 18,
  },
  timeCoverage: { active: "unavailable", waiting: "unavailable" },
  projects: [],
  records: [],
  adjustments: [],
  projectTotals: [],
  dailyTotals: [],
  repositoryInvolvement: [],
  deliveries: [],
  reports: [],
};

describe("WorkSummary", () => {
  it("shows total recorded work without a metric selector or double-counting tasks", () => {
    let renderer: ReactTestRenderer;
    act(() => {
      renderer = create(createElement(WorkSummary, { overview, days: ["2026-09-23"] }));
    });
    const headline = () =>
      renderer!.root
        .findAllByType("span")
        .filter((node) => node.props.className?.includes("text-4xl"))
        .map((node) => node.children.join(""));
    expect(headline()).toEqual(["3h"]);
    expect(renderer!.root.findAllByType("h2").map((node) => node.children.join(""))).toContain(
      "Today's total",
    );
    expect(renderer!.root.findAllByProps({ "aria-label": "Work chart metric" })).toHaveLength(0);
    expect(renderer!.root.findAllByType("span").map((node) => node.children.join(""))).toContain(
      "Task and subagent durations; excluded from total to avoid double-counting",
    );
  });

  it("keeps old-server totals without inventing daily history", () => {
    const { dailyTotals: _daily, ...legacyOverview } = overview;
    let renderer: ReactTestRenderer;
    act(() => {
      renderer = create(
        createElement(WorkSummary, { overview: legacyOverview, days: ["2026-09-23"] }),
      );
    });
    const paragraphs = renderer!.root.findAllByType("p").map((node) => node.children.join(""));
    expect(paragraphs.some((text) => text.includes("Daily history is unavailable"))).toBe(true);
    expect(renderer!.root.findAllByType("svg")).toHaveLength(0);
    expect(renderer!.root.findAllByType("span").map((node) => node.children.join(""))).toContain(
      "200",
    );
  });
});
