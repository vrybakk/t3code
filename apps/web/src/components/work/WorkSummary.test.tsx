import { act, createElement } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { describe, expect, it, vi } from "vite-plus/test";

vi.mock("../ui/toggle-group", () => ({ Toggle: "button", ToggleGroup: "div" }));

import { WorkSummary } from "./WorkSummary.tsx";

describe("WorkSummary", () => {
  it("shows server-provided token and tool-use totals", () => {
    let renderer: ReactTestRenderer;
    act(() => {
      renderer = create(
        createElement(WorkSummary, {
          summaries: [
            {
              label: "This month",
              overview: {
                totals: {
                  manualMs: 0,
                  agentElapsedMs: 0,
                  agentActiveMs: 0,
                  agentWaitingMs: 0,
                  agentTaskMs: 0,
                  inputTokens: 1_000,
                  cachedInputTokens: 200,
                  outputTokens: 300,
                  reasoningTokens: 40,
                  toolUses: 5,
                  records: 1,
                },
                timeCoverage: { active: "unavailable", waiting: "unavailable" },
              } as never,
            },
          ],
        }),
      );
    });
    const text = renderer!.root.findAllByType("p").map((paragraph) => paragraph.children.join(""));
    expect(text).toContain("1,000");
    expect(text).toContain("200");
    expect(text).toContain("300");
    expect(text).toContain("40");
    expect(text).toContain("5");
    expect(text.filter((value) => value.includes("unavailable"))).toHaveLength(0);
  });
});
