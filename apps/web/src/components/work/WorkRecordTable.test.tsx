import { act, createElement } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { AsyncResult } from "effect/unstable/reactivity";
import * as Schema from "effect/Schema";
import { WorkRecord, type WorkOverviewInput } from "@t3tools/contracts";

const state = vi.hoisted(() => ({
  legacy: false,
  offset: 0,
  count: 52,
  records: null as ReadonlyArray<WorkRecord> | null,
}));
vi.mock("../../state/server", () => ({
  serverEnvironment: { workOverview: ({ input }: { input: WorkOverviewInput }) => input },
}));
vi.mock("@effect/atom-react", () => ({
  useAtomValue: (input: WorkOverviewInput) => {
    state.offset = input.recordOffset ?? 0;
    const all =
      state.records ??
      Array.from({ length: state.count }, (_, i) => ({
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
      totals: { records: all.length },
      ...(state.legacy ? {} : { recordPage: { offset: state.offset, limit: 25 } }),
    });
  },
}));
import { WorkRecordTable } from "./WorkRecordTable";

const decodeRecord = Schema.decodeUnknownSync(WorkRecord);
const decodeRecordId = Schema.decodeSync(WorkRecord.fields.id);

describe("Work record pagination", () => {
  beforeEach(() => {
    state.legacy = false;
    state.offset = 0;
    state.count = 52;
    state.records = null;
  });
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

  it("edits only manual activity and forwards the current complete corrected record", () => {
    const manual = decodeRecord({
      id: "manual-current",
      kind: "manual",
      trackingProjectId: "project",
      projectId: "source-project",
      threadId: "thread",
      turnId: null,
      repositoryId: "repository",
      crossRepository: true,
      occurredAt: "2026-09-23T10:00:00Z",
      durationMs: 120000,
      elapsedMs: null,
      activeMs: null,
      waitingMs: null,
      taskMs: null,
      provider: null,
      model: null,
      effort: null,
      surface: null,
      tokens: {
        inputTokens: null,
        cachedInputTokens: null,
        outputTokens: null,
        reasoningTokens: null,
      },
      toolUsage: null,
      outcome: "succeeded",
      coverage: "complete",
      category: "Review",
      note: "Corrected review",
      sourceEventId: null,
      revision: 2,
      supersedesId: "manual-original",
      createdAt: "2026-09-23T10:00:00Z",
      updatedAt: "2026-09-23T11:00:00Z",
    });
    const agent: WorkRecord = {
      ...manual,
      id: decodeRecordId("agent-record"),
      kind: "agent-turn",
      category: null,
      note: null,
      durationMs: null,
      elapsedMs: 300000,
      provider: "codex",
      model: "model",
      revision: 0,
      supersedesId: null,
      tokens: { inputTokens: 1000, cachedInputTokens: 0, outputTokens: 100, reasoningTokens: 0 },
    };
    state.records = [agent, manual];
    const onEdit = vi.fn();
    let renderer: ReactTestRenderer;
    const render = () =>
      createElement(WorkRecordTable, {
        environmentId: "env" as never,
        window: { since: "2026-09-01T00:00:00Z", until: "2026-10-01T00:00:00Z" },
        projects: [],
        timeZone: "UTC",
        onEdit,
      });
    act(() => {
      renderer = create(render());
    });
    const rows = () => renderer!.root.findByType("tbody").findAllByType("tr");
    expect(rows()).toHaveLength(2);
    expect(rows()[0]!.findAllByType("button")).toHaveLength(0);
    expect(rows()[1]!.findAllByType("button")).toHaveLength(1);
    expect(JSON.stringify(renderer!.toJSON())).toContain("Corrected review");
    act(() => rows()[1]!.findByType("button").props.onClick());
    expect(onEdit).toHaveBeenLastCalledWith(manual);
    expect(onEdit.mock.calls[0]?.[0]).toBe(manual);

    const updated = { ...manual, note: "Latest correction", durationMs: 180000, revision: 3 };
    state.records = [agent, updated];
    act(() => renderer!.update(render()));
    expect(JSON.stringify(renderer!.toJSON())).toContain("Latest correction");
    act(() => rows()[1]!.findByType("button").props.onClick());
    expect(onEdit).toHaveBeenLastCalledWith(updated);
    expect(onEdit.mock.calls[1]?.[0]).toBe(updated);
    act(() => renderer!.unmount());
  });
});
