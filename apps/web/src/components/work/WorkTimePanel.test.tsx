import {
  EnvironmentId,
  WorkRecordId,
  WorkTrackingProjectId,
  type WorkRecord,
} from "@t3tools/contracts";
import { AsyncResult, Atom } from "effect/unstable/reactivity";
import { act, createElement } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { expect, it, vi } from "vite-plus/test";

const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("../../state/server", () => ({ serverEnvironment: { workManualRecords: query } }));
vi.mock("./WorkSelect", () => ({ WorkSelect: "select" }));

import { WorkTimePanel } from "./WorkTimePanel";

it("loads manual history only on Time and preserves an unsaved note when leaving it", () => {
  const record = {
    id: WorkRecordId.make("entry"),
    kind: "manual",
    trackingProjectId: WorkTrackingProjectId.make("project"),
    occurredAt: "2026-09-01T12:00:00.000Z",
    durationMs: 60_000,
    note: "Saved entry",
  } as WorkRecord;
  query.mockReturnValue(Atom.make(AsyncResult.success([record])));
  const props = {
    active: false,
    environmentId: EnvironmentId.make("local"),
    timeZone: "UTC",
    projects: [
      {
        id: WorkTrackingProjectId.make("project"),
        name: "Project",
        trackingEnabled: true,
        t3ProjectIds: [],
        repositories: [],
        createdAt: "2026-09-01T12:00:00.000Z",
        updatedAt: "2026-09-01T12:00:00.000Z",
      },
    ],
    threads: [],
    month: "2026-09",
    pending: false,
    onMonthChange: vi.fn(),
    onSave: vi.fn(async () => true),
  };
  let renderer: ReactTestRenderer;
  act(() => {
    renderer = create(createElement(WorkTimePanel, props));
  });
  expect(query).not.toHaveBeenCalled();
  act(() => renderer!.update(createElement(WorkTimePanel, { ...props, active: true })));
  expect(JSON.stringify(renderer!.toJSON())).toContain("Saved entry");
  act(() =>
    renderer!.root
      .findByProps({ id: "work-manual-note" })
      .props.onChange({ target: { value: "Unsaved draft" } }),
  );
  const calls = query.mock.calls.length;
  act(() => renderer!.update(createElement(WorkTimePanel, props)));
  expect(query).toHaveBeenCalledTimes(calls);
  expect(JSON.stringify(renderer!.toJSON())).not.toContain("Saved entry");
  act(() => renderer!.update(createElement(WorkTimePanel, { ...props, active: true })));
  expect(renderer!.root.findByProps({ id: "work-manual-note" }).props.value).toBe("Unsaved draft");
  act(() => renderer!.unmount());
});
