import { act, createElement } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { AsyncResult } from "effect/unstable/reactivity";
import type { WorkOverviewInput } from "@t3tools/contracts";

const state = vi.hoisted(() => ({ inputs: [] as Array<WorkOverviewInput> }));
vi.mock("../ui/input", () => ({ Input: "input" }));
vi.mock("../ui/label", () => ({ Label: "label" }));
vi.mock("../../state/server", () => ({
  serverEnvironment: { workOverview: ({ input }: { input: WorkOverviewInput }) => input },
}));
vi.mock("@effect/atom-react", () => ({
  useAtomValue: (input: WorkOverviewInput) => {
    state.inputs.push(input);
    const offset = input.recordOffset ?? 0;
    return AsyncResult.success({
      records: Array.from({ length: 25 }, (_, i) => ({
        id: `row-${offset + i}`,
        kind: "manual",
        trackingProjectId: "project",
        occurredAt: "2026-09-23T10:00:00Z",
        category: `Activity ${offset + i}`,
        note: null,
        revision: 0,
        durationMs: 60000,
        tokens: {},
      })),
      totals: { records: 60 },
      recordPage: { offset, limit: 25 },
    });
  },
}));
import { WorkActivity } from "./WorkActivity";

function renderActivity() {
  let renderer: ReactTestRenderer;
  act(() => {
    renderer = create(
      createElement(WorkActivity, {
        environmentId: "env" as never,
        projects: [],
        timeZone: "Europe/Madrid",
        month: "2026-09",
        projectId: "",
        onEdit: vi.fn(),
      }),
    );
  });
  return renderer!;
}

describe("Work activity date filtering", () => {
  beforeEach(() => {
    state.inputs = [];
  });

  it("stops querying and hides old rows for empty or reversed dates, then restores valid results", () => {
    const renderer = renderActivity();
    expect(renderer.root.findAllByType("table")).toHaveLength(1);
    const change = (id: string, value: string) =>
      act(() => {
        renderer.root.findByProps({ id }).props.onChange({ target: { value } });
      });
    state.inputs = [];
    change("work-activity-from", "");
    expect(state.inputs).toHaveLength(0);
    expect(renderer.root.findAllByType("table")).toHaveLength(0);
    expect(renderer.root.findByProps({ role: "alert" }).children.join("")).toContain(
      "Choose valid dates",
    );
    change("work-activity-from", "2026-10-01");
    expect(state.inputs).toHaveLength(0);
    expect(renderer.root.findAllByType("table")).toHaveLength(0);
    change("work-activity-through", "2026-10-01");
    expect(state.inputs.at(-1)).toMatchObject({
      since: "2026-09-30T22:00:00.000Z",
      until: "2026-10-01T22:00:00.000Z",
      recordOffset: 0,
    });
    expect(renderer.root.findAllByProps({ role: "alert" })).toHaveLength(0);
    expect(renderer.root.findByType("tbody").findAllByType("tr")).toHaveLength(25);
    act(() => renderer.unmount());
  });

  it("loads only one page and returns to page one when either date changes", () => {
    const renderer = renderActivity();
    const next = () =>
      act(() => {
        renderer.root
          .findAllByType("button")
          .find((button) => button.children.includes("Next"))!
          .props.onClick();
      });
    expect(state.inputs.at(-1)).toMatchObject({
      since: "2026-08-31T22:00:00.000Z",
      until: "2026-09-30T22:00:00.000Z",
      includeRecords: true,
      includeAdjustments: false,
      recordLimit: 25,
      recordOffset: 0,
    });
    for (const [id, value] of [
      ["work-activity-from", "2026-09-10"],
      ["work-activity-through", "2026-09-20"],
    ]) {
      next();
      expect(state.inputs.at(-1)?.recordOffset).toBe(25);
      expect(JSON.stringify(renderer.toJSON())).toContain("Activity 25");
      act(() => renderer.root.findByProps({ id }).props.onChange({ target: { value } }));
      expect(state.inputs.at(-1)?.recordOffset).toBe(0);
      expect(JSON.stringify(renderer.toJSON())).toContain("Activity 0");
      expect(JSON.stringify(renderer.toJSON())).not.toContain("Activity 25");
    }
    expect(state.inputs.at(-1)).toMatchObject({
      since: "2026-09-09T22:00:00.000Z",
      until: "2026-09-20T22:00:00.000Z",
    });
    act(() => renderer.unmount());
  });
});
