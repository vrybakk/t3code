import { act, createElement } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { describe, expect, it } from "vite-plus/test";

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
    const tokenSummary = renderer!.root
      .findAllByType("p")
      .find((paragraph) => paragraph.children.join("").startsWith("Tokens"));
    expect(tokenSummary?.children.join("")).toBe(
      "Tokens · Input 1,000 · Cached input 200 · Output 300 · Reasoning 40 · Tool uses 5",
    );
  });
});
