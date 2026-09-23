import { act, createElement } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { describe, expect, it, vi } from "vite-plus/test";
import { AsyncResult } from "effect/unstable/reactivity";
import type { WorkOverviewInput } from "@t3tools/contracts";

const state = vi.hoisted(() => ({ legacy: false, offset: 0, count: 52 }));
vi.mock("../../state/server", () => ({
  serverEnvironment: { workOverview: ({ input }: { input: WorkOverviewInput }) => input },
}));
vi.mock("@effect/atom-react", () => ({
  useAtomValue: (input: WorkOverviewInput) => {
    state.offset = input.recordOffset ?? 0;
    const all = Array.from({ length: state.count }, (_, i) => ({
      id: `row-${i}`,
      kind: "manual",
      trackingProjectId: "project",
      occurredAt: "2026-09-23T10:00:00Z",
      category: `Activity ${i}`,
      note: null,
      revision: 0,
      durationMs: 60000,
      tokens: {},
    }));
    return AsyncResult.success({
      records: state.legacy
        ? all
        : all.slice(state.offset, state.offset + (input.recordLimit ?? 25)),
      totals: { records: state.count },
      ...(state.legacy ? {} : { recordPage: { offset: state.offset, limit: 25 } }),
    });
  },
}));
import { WorkRecordTable } from "./WorkRecordTable";

describe("Work record pagination", () => {
  it("renders only one server page, navigates both directions and bounds the final page", () => {
    state.legacy = false;
    let renderer: ReactTestRenderer;
    act(() => {
      renderer = create(
        createElement(WorkRecordTable, {
          environmentId: "env" as never,
          window: { since: "2026-09-01T00:00:00Z", until: "2026-10-01T00:00:00Z" },
          projects: [],
          timeZone: "UTC",
        }),
      );
    });
    const rows = () => renderer!.root.findByType("tbody").findAllByType("tr");
    const next = () =>
      renderer!.root.findAllByType("button").find((button) => button.children.includes("Next"))!;
    expect(rows()).toHaveLength(25);
    act(() => next().props.onClick());
    expect(state.offset).toBe(25);
    expect(JSON.stringify(renderer!.toJSON())).toContain("Activity 25");
    act(() => next().props.onClick());
    expect(rows()).toHaveLength(2);
    expect(next().props.disabled).toBe(true);
    state.count = 50;
    act(() =>
      renderer!.update(
        createElement(WorkRecordTable, {
          environmentId: "env" as never,
          window: { since: "2026-09-01T00:00:00Z", until: "2026-10-01T00:00:00Z" },
          projects: [],
          timeZone: "UTC",
        }),
      ),
    );
    expect(state.offset).toBe(25);
    expect(rows()).toHaveLength(25);
    expect(JSON.stringify(renderer!.toJSON())).not.toContain("Page 3");
    act(() =>
      renderer!.root
        .findAllByType("button")
        .find((button) => button.children.includes("Previous"))!
        .props.onClick(),
    );
    expect(state.offset).toBe(0);
    state.count = 52;
    act(() => renderer!.unmount());
  });
  it("bounds old-server data and does not pretend it supports pagination", () => {
    state.legacy = true;
    let renderer: ReactTestRenderer;
    act(() => {
      renderer = create(
        createElement(WorkRecordTable, {
          environmentId: "env" as never,
          window: { since: "2026-09-01T00:00:00Z", until: "2026-10-01T00:00:00Z" },
          projects: [],
          timeZone: "UTC",
        }),
      );
    });
    expect(renderer!.root.findByType("tbody").findAllByType("tr")).toHaveLength(25);
    expect(renderer!.root.findAllByType("button")).toHaveLength(0);
    expect(JSON.stringify(renderer!.toJSON())).toContain("paginated history");
    act(() => renderer!.unmount());
  });
});
