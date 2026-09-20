import { act, createElement } from "react";
import { create } from "react-test-renderer";
import { describe, expect, it, vi } from "vite-plus/test";

const state = vi.hoisted(() => ({ result: null as unknown }));

vi.mock("@effect/atom-react", () => ({ useAtomValue: () => state.result }));
vi.mock("../../state/server", () => ({
  serverEnvironment: { workReportSnapshot: () => null },
}));

import { AsyncResult } from "effect/unstable/reactivity";

import { shouldPrintSnapshot, WorkReportSnapshotPrint } from "./WorkReportSnapshotPrint.tsx";

describe("shouldPrintSnapshot", () => {
  it("only permits printing the snapshot selected by its immutable report id", () => {
    const snapshot = { report: { id: "report-a" } } as never;
    expect(shouldPrintSnapshot(snapshot, "report-a" as never)).toBe(true);
    expect(shouldPrintSnapshot(snapshot, "report-b" as never)).toBe(false);
  });

  it("unmounts after printing so the same snapshot can be requested again", async () => {
    const reportId = "report-a" as never;
    state.result = AsyncResult.success({
      report: {
        id: reportId,
        month: "2026-09",
        status: "open",
        generatedAt: "2026-09-01T00:00:00.000Z",
      },
      projectName: "Ledger",
      profileDisplayName: "Developer",
      records: [],
      totals: {
        manualMs: 0,
        agentElapsedMs: 0,
        agentActiveMs: 0,
        agentWaitingMs: 0,
        agentTaskMs: 0,
        inputTokens: 10,
        cachedInputTokens: 2,
        outputTokens: 4,
        reasoningTokens: 1,
        toolUses: 3,
        records: 0,
      },
    } as never);
    const print = vi.fn();
    vi.stubGlobal("window", { print });
    const firstComplete = vi.fn();
    let renderer: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(
        createElement(WorkReportSnapshotPrint, {
          environmentId: "environment" as never,
          reportId,
          onPrinted: firstComplete,
        }),
      );
    });
    const tokenSummary = renderer!.root
      .findAllByType("p")
      .find((paragraph) => paragraph.children.join("").startsWith("Tokens"));
    expect(tokenSummary?.children.join("")).toBe(
      "Tokens · Input 10 · Cached input 2 · Output 4 · Reasoning 1 · Tool uses 3",
    );
    expect(print).toHaveBeenCalledOnce();
    expect(firstComplete).toHaveBeenCalledOnce();

    const secondComplete = vi.fn();
    await act(async () => {
      create(
        createElement(WorkReportSnapshotPrint, {
          environmentId: "environment" as never,
          reportId,
          onPrinted: secondComplete,
        }),
      );
    });
    expect(print).toHaveBeenCalledTimes(2);
    expect(secondComplete).toHaveBeenCalledOnce();
    vi.unstubAllGlobals();
  });
});
