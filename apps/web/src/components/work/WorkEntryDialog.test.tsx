import { ThreadId, WorkRecordId, WorkTrackingProjectId, type WorkRecord } from "@t3tools/contracts";
import { act, createElement, type ComponentProps } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, expect, it, vi } from "vite-plus/test";

vi.mock("../ui/dialog", () => ({
  Dialog: "dialog",
  DialogDescription: "p",
  DialogHeader: "header",
  DialogPanel: "section",
  DialogPopup: "section",
  DialogTitle: "h2",
}));
vi.mock("../ui/button", () => ({ Button: "button" }));
vi.mock("../ui/input", () => ({ Input: "input" }));
vi.mock("../ui/label", () => ({ Label: "label" }));
vi.mock("../ui/textarea", () => ({ Textarea: "textarea" }));
vi.mock("./WorkSelect", () => ({ WorkSelect: "select" }));

import { WorkEntryDialog } from "./WorkEntryDialog";

const timestamp = "2026-09-23T10:00:00.000Z";
const project = {
  id: WorkTrackingProjectId.make("project"),
  name: "Project",
  trackingEnabled: true,
  t3ProjectIds: [],
  repositories: [],
  createdAt: timestamp,
  updatedAt: timestamp,
};
const record: WorkRecord = {
  id: WorkRecordId.make("entry"),
  kind: "manual",
  trackingProjectId: project.id,
  projectId: null,
  threadId: ThreadId.make("archived-thread"),
  turnId: null,
  repositoryId: null,
  crossRepository: false,
  occurredAt: timestamp,
  durationMs: 90_000,
  elapsedMs: null,
  activeMs: null,
  waitingMs: null,
  taskMs: null,
  provider: null,
  model: null,
  effort: null,
  surface: null,
  tokens: { inputTokens: null, cachedInputTokens: null, outputTokens: null, reasoningTokens: null },
  toolUsage: null,
  outcome: "succeeded",
  coverage: "complete",
  category: "Review",
  note: "Original note",
  sourceEventId: null,
  revision: 0,
  supersedesId: null,
  createdAt: timestamp,
  updatedAt: timestamp,
};
let renderer: ReactTestRenderer | undefined;
afterEach(() => {
  act(() => renderer?.unmount());
});
function render(overrides: Partial<ComponentProps<typeof WorkEntryDialog>> = {}) {
  const props = {
    open: true,
    onOpenChange: vi.fn(),
    projects: [project],
    threads: [],
    onSave: vi.fn(async () => true),
    ...overrides,
  };
  act(() => {
    renderer = create(createElement(WorkEntryDialog, props));
  });
  return props;
}
function change(id: string, value: string) {
  act(() => renderer!.root.findByProps({ id }).props.onChange({ target: { value } }));
}
async function submit() {
  await act(async () =>
    renderer!.root.findByType("form").props.onSubmit({ preventDefault: vi.fn() }),
  );
}

it("validates manual input and submits a typed entry before closing", async () => {
  const props = render();
  await submit();
  expect(props.onSave).not.toHaveBeenCalled();
  expect(renderer!.root.findByProps({ role: "alert" }).children.join("")).toContain("duration");
  change("work-manual-duration", "1.5");
  change("work-manual-note", "  Work completed  ");
  await submit();
  expect(props.onSave).toHaveBeenCalledWith(
    expect.objectContaining({
      trackingProjectId: project.id,
      durationMs: 90_000,
      note: "Work completed",
    }),
  );
  expect(props.onOpenChange).toHaveBeenCalledWith(false);
});

it("retains values after failed save, prevents dismissal and duplicate saves while pending", async () => {
  let resolveSave!: (value: boolean) => void;
  const result = new Promise<boolean>((resolve) => {
    resolveSave = resolve;
  });
  const onSave = vi.fn(() => result);
  const props = render({ onSave });
  change("work-manual-duration", "15");
  change("work-manual-note", "Keep this");
  let saving: Promise<void>;
  act(() => {
    saving = renderer!.root.findByType("form").props.onSubmit({ preventDefault: vi.fn() });
  });
  const cancel = vi.fn();
  act(() => renderer!.root.findByType("dialog").props.onOpenChange(false, { cancel }));
  expect(cancel).toHaveBeenCalledOnce();
  expect(props.onOpenChange).not.toHaveBeenCalled();
  await submit();
  expect(onSave).toHaveBeenCalledOnce();
  await act(async () => {
    resolveSave(false);
    await saving;
  });
  expect(renderer!.root.findByProps({ id: "work-manual-note" }).props.value).toBe("Keep this");
  expect(renderer!.root.findByProps({ role: "alert" }).children.join("")).toContain(
    "Could not save",
  );
  onSave.mockResolvedValue(true);
  await submit();
  expect(props.onOpenChange).toHaveBeenCalledWith(false);
});

it("edits the existing record and preserves its archived thread attribution", async () => {
  const props = render({ record });
  expect(renderer!.root.findByProps({ id: "work-manual-duration" }).props.value).toBe("1.5");
  change("work-manual-note", "Corrected note");
  await submit();
  expect(props.onSave).toHaveBeenCalledWith(
    expect.objectContaining({
      id: record.id,
      threadId: record.threadId,
      durationMs: 90_000,
      note: "Corrected note",
    }),
  );
});

it("resets the form when reopened or changed to another entry", () => {
  const props = render({ record });
  change("work-manual-note", "Discarded draft");
  act(() => renderer!.update(createElement(WorkEntryDialog, { ...props, open: false })));
  expect(renderer!.root.findAllByType("form")).toHaveLength(0);
  act(() => renderer!.update(createElement(WorkEntryDialog, { ...props, record: null })));
  expect(renderer!.root.findByProps({ id: "work-manual-note" }).props.value).toBe("");
  act(() => renderer!.update(createElement(WorkEntryDialog, props)));
  expect(renderer!.root.findByProps({ id: "work-manual-note" }).props.value).toBe("Original note");
});

it("surfaces thrown save errors without discarding the draft", async () => {
  const props = render({
    onSave: vi.fn(async () => {
      throw new Error("Connection lost");
    }),
  });
  change("work-manual-duration", "20");
  await submit();
  expect(renderer!.root.findByProps({ role: "alert" }).children.join("")).toBe("Connection lost");
  expect(renderer!.root.findByProps({ id: "work-manual-duration" }).props.value).toBe("20");
  expect(props.onOpenChange).not.toHaveBeenCalled();
});
