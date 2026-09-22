import { act, createElement } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

vi.mock("@tanstack/react-router", () => ({ Link: "a" }));

import { WorkRunningSessions } from "./WorkRunningSessions";

const start = "2026-09-22T10:00:00.000Z";
const thread = {
  id: "thread",
  environmentId: "environment",
  projectId: "project",
  title: "Review changes",
  latestTurn: { requestedAt: start, startedAt: start, completedAt: null },
  session: { status: "running", updatedAt: start },
  hasPendingApprovals: true,
  hasPendingUserInput: false,
};

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Work running sessions", () => {
  it("shows a starting session before its first turn projection arrives", () => {
    vi.stubGlobal("window", { setInterval, clearInterval });
    let renderer: ReactTestRenderer;
    act(() => {
      renderer = create(
        createElement(WorkRunningSessions, {
          threads: [
            { ...thread, latestTurn: null, session: { status: "starting", updatedAt: start } },
          ] as never,
          projects: [],
          enabled: false,
        }),
      );
    });
    expect(JSON.stringify(renderer!.toJSON())).toContain("Review changes");
    act(() => {
      renderer!.unmount();
    });
  });
  it("ticks elapsed time, distinguishes tracking off, and removes completed sessions", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(start));
    vi.stubGlobal("window", { setInterval, clearInterval });
    let renderer: ReactTestRenderer;
    const render = (completed = false, enabled = true) =>
      createElement(WorkRunningSessions, {
        threads: [
          {
            ...thread,
            latestTurn: { ...thread.latestTurn, completedAt: completed ? start : null },
          },
        ] as never,
        projects: [
          { id: "ledger", name: "Website", t3ProjectIds: ["project"], trackingEnabled: true },
        ] as never,
        enabled,
      });
    act(() => {
      renderer = create(render());
    });
    expect(JSON.stringify(renderer!.toJSON())).toContain("Waiting for you");
    act(() => {
      vi.advanceTimersByTime(65_000);
    });
    expect(JSON.stringify(renderer!.toJSON())).toContain("1m");
    act(() => {
      renderer!.update(render(false, false));
    });
    expect(JSON.stringify(renderer!.toJSON())).toContain("Tracking off");
    act(() => {
      renderer!.update(render(true));
    });
    expect(renderer!.toJSON()).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
    act(() => {
      renderer!.unmount();
    });
  });
});
