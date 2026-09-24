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
  latestTurn: { state: "running", requestedAt: start, startedAt: start, completedAt: null },
  session: { status: "running", updatedAt: start },
  hasPendingApprovals: true,
  hasPendingUserInput: false,
};

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Work running sessions", () => {
  it("keeps all six running turns visible after checkpoints without resetting their timers", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-22T10:20:00.000Z"));
    vi.stubGlobal("window", { setInterval, clearInterval });
    const threads = Array.from({ length: 6 }, (_, index) => ({
      ...thread,
      id: `thread-${index}`,
      title: `Running thread ${index}`,
      session: { ...thread.session, updatedAt: "2026-09-22T10:18:00.000Z" },
      latestTurn: {
        ...thread.latestTurn,
        completedAt: index < 3 ? "2026-09-22T10:05:00.000Z" : null,
      },
    }));
    let renderer: ReactTestRenderer;
    act(() => {
      renderer = create(
        createElement(WorkRunningSessions, {
          threads: threads as never,
          projects: [],
          enabled: true,
        }),
      );
    });
    const rows = renderer!.root.findAllByType("a");
    expect(rows).toHaveLength(6);
    for (const row of rows) {
      expect(row.findByType("span").children).toEqual(["20m"]);
    }
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    for (const row of renderer!.root.findAllByType("a")) {
      expect(row.findByType("span").children).toEqual(["21m"]);
    }
    act(() => renderer!.unmount());
  });
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
            latestTurn: {
              ...thread.latestTurn,
              state: completed ? "completed" : "running",
              completedAt: completed ? start : null,
            },
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
