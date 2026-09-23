import {
  EnvironmentId,
  StorageCleanupError,
  type StorageCleanupReviewResult,
} from "@t3tools/contracts";
import { AsyncResult } from "effect/unstable/reactivity";
import { act, type ReactNode } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
  review: vi.fn(),
  execute: vi.fn(),
  completed: vi.fn(),
  closed: vi.fn(),
  toast: vi.fn(),
}));
vi.mock("../../state/storageUsage", () => ({
  storageReviewCleanup: "review",
  storageExecuteCleanup: "execute",
}));
vi.mock("../../state/use-atom-command", () => ({
  useAtomCommand: (command: string) => (command === "review" ? mocks.review : mocks.execute),
}));
vi.mock("../ui/button", () => ({ Button: "button" }));
vi.mock("../ui/input", () => ({ Input: "input" }));
vi.mock("../ui/checkbox", () => ({
  Checkbox: ({
    checked,
    onCheckedChange,
    disabled,
  }: {
    checked: boolean;
    onCheckedChange: (next: boolean) => void;
    disabled: boolean;
  }) => (
    <button
      role="checkbox"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
    />
  ),
}));
vi.mock("../ui/toast", () => ({ toastManager: { add: mocks.toast } }));
vi.mock("../ui/dialog", () => ({
  Dialog: ({ children }: { children: ReactNode }) => <div role="dialog">{children}</div>,
  DialogPopup: "div",
  DialogHeader: "header",
  DialogTitle: "h2",
  DialogDescription: "p",
  DialogPanel: "section",
  DialogFooter: "footer",
}));

import { StorageCleanupDialog } from "./StorageCleanupDialog";
import { StorageCleanupReview } from "./StorageCleanupReview";
import { storageReviewSuggestion } from "./StorageCleanup.logic";

const environmentId = EnvironmentId.make("test-machine");
const preview: StorageCleanupReviewResult = {
  planId: "review-plan",
  expiresAt: "2026-09-23T18:00:00.000Z",
  trashSupported: true,
  items: [
    {
      id: "a",
      filePath: "/provider/a.jsonl",
      logicalBytes: 1_024,
      allocatedBytes: 4_096,
      eligible: true,
      reason: null,
    },
    {
      id: "b",
      filePath: "/provider/b.jsonl",
      logicalBytes: 2_048,
      allocatedBytes: 4_096,
      eligible: false,
      reason: "Active session",
    },
  ],
  totals: { logicalBytes: 1_024, allocatedBytes: 4_096, fileCount: 1 },
  eligibleCount: 1,
  blockedCount: 1,
  warnings: [],
};
let renderer: ReactTestRenderer | undefined;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocks.review.mockReset().mockResolvedValue(AsyncResult.success(preview));
  mocks.execute.mockReset().mockResolvedValue(
    AsyncResult.success({
      planId: "review-plan",
      mode: "trash",
      items: [
        { id: "a", filePath: "/provider/a.jsonl", status: "trashed", reason: null },
        { id: "b", filePath: "/provider/b.jsonl", status: "blocked", reason: "Active session" },
      ],
      processedTotals: preview.totals,
    }),
  );
});
afterEach(async () => {
  await act(async () => renderer?.unmount());
  renderer = undefined;
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});
const text = () => JSON.stringify(renderer!.toJSON());
function button(label: string) {
  return renderer!.root.findAllByType("button").find((item) => item.children.includes(label))!;
}
async function click(label: string) {
  expect(button(label)).toBeDefined();
  expect(button(label).props.disabled).not.toBe(true);
  await act(async () => button(label).props.onClick());
}
async function acknowledge() {
  for (const item of renderer!.root.findAllByProps({ role: "checkbox" }))
    await act(async () => item.props.onClick());
}
async function mount(value = preview) {
  await act(async () => {
    renderer = create(
      <StorageCleanupDialog
        preview={value}
        environmentId={environmentId}
        label="Test host"
        onClose={mocks.closed}
        onCompleted={mocks.completed}
      />,
    );
  });
}

it("defaults to Trash, requires both acknowledgments and sends only a reviewed plan", async () => {
  await mount();
  expect(text()).toContain("Test host");
  expect(text()).toContain("Active session");
  expect(button("Confirm move to Trash").props.disabled).toBe(true);
  expect(mocks.execute).not.toHaveBeenCalled();
  await acknowledge();
  await click("Confirm move to Trash");
  expect(mocks.execute).toHaveBeenCalledWith({
    environmentId,
    input: {
      planId: "review-plan",
      mode: "trash",
      acknowledgeExternalSessionsStopped: true,
      acknowledgeHistoryLoss: true,
      confirmPermanentDelete: false,
    },
  });
  expect(text()).toContain("trashed");
  expect(text()).toContain("blocked: Active session");
  expect(text()).toContain("still occupy disk space");
  expect(mocks.completed).not.toHaveBeenCalled();
  await click("Done and refresh");
  expect(mocks.completed).toHaveBeenCalledOnce();
  expect(mocks.closed).toHaveBeenCalledOnce();
});

it("never falls back from unsupported Trash and requires typed permanent confirmation", async () => {
  await mount({ ...preview, trashSupported: false });
  await acknowledge();
  expect(button("Confirm move to Trash").props.disabled).toBe(true);
  expect(mocks.execute).not.toHaveBeenCalled();
  expect(text()).toContain("Trash is unavailable");
  await click("Permanently delete instead");
  expect(button("Confirm permanent deletion").props.disabled).toBe(true);
  await act(async () =>
    renderer!.root.findByType("input").props.onChange({ target: { value: "DELETE" } }),
  );
  await click("Confirm permanent deletion");
  expect(mocks.execute).toHaveBeenLastCalledWith({
    environmentId,
    input: {
      planId: "review-plan",
      mode: "delete",
      acknowledgeExternalSessionsStopped: true,
      acknowledgeHistoryLoss: true,
      confirmPermanentDelete: true,
    },
  });
});

it("keeps failed operations visible and requires another review instead of retrying automatically", async () => {
  mocks.execute.mockResolvedValueOnce(
    AsyncResult.fail(new StorageCleanupError({ detail: "Plan expired", reason: "expired-plan" })),
  );
  await mount();
  await acknowledge();
  await click("Confirm move to Trash");
  expect(text()).toContain("Plan expired");
  expect(button("Confirm move to Trash").props.disabled).toBe(true);
  expect(mocks.execute).toHaveBeenCalledOnce();
  expect(mocks.completed).not.toHaveBeenCalled();
});

it("does not enable removal when every reviewed file is blocked", async () => {
  await mount({
    ...preview,
    eligibleCount: 0,
    blockedCount: 2,
    items: preview.items.map((item) => ({ ...item, eligible: false, reason: "Active session" })),
  });
  await acknowledge();
  expect(button("Confirm move to Trash").props.disabled).toBe(true);
  expect(mocks.execute).not.toHaveBeenCalled();
});

it("uses actual zero-processed outcomes instead of the previously eligible counts and sizes", async () => {
  mocks.execute.mockResolvedValueOnce(
    AsyncResult.success({
      planId: "review-plan",
      mode: "trash",
      items: preview.items.map((item) => ({
        id: item.id,
        filePath: item.filePath,
        status: "blocked",
        reason: "File changed after review",
      })),
      processedTotals: { logicalBytes: 0, allocatedBytes: 0, fileCount: 0 },
    }),
  );
  await mount();
  await acknowledge();
  await click("Confirm move to Trash");
  expect(text()).toContain("0 processed · 2 blocked or failed");
  expect(text()).not.toContain("eligible files");
  expect(text()).toContain("Processed file sizes");
  expect(text()).toContain("No files were removed.");
  expect(text()).not.toContain("Files in Trash still occupy");
  expect(mocks.toast).toHaveBeenCalledWith(
    expect.objectContaining({
      title: "No files removed",
      description: "0 processed; 2 blocked or failed. Selected files were kept.",
    }),
  );
});

it("reviews opaque snapshot selections without executing cleanup", async () => {
  await act(async () => {
    renderer = create(
      <StorageCleanupReview
        environmentId={environmentId}
        label="Test host"
        snapshotId="snapshot-a"
        groupIds={["group-a"]}
        historyIds={["history-a"]}
        disabled={false}
        onCompleted={mocks.completed}
        onClear={vi.fn()}
      />,
    );
  });
  expect(mocks.review).not.toHaveBeenCalled();
  await click("Review cleanup");
  expect(mocks.review).toHaveBeenCalledWith({
    environmentId,
    input: { snapshotId: "snapshot-a", groupIds: ["group-a"], historyIds: ["history-a"] },
  });
  expect(mocks.execute).not.toHaveBeenCalled();
  expect(text()).toContain("Review native history cleanup");
});

it("describes large and old unlinked histories only as review candidates", () => {
  expect(
    storageReviewSuggestion(
      { logicalBytes: 100 * 1_024 ** 2, threads: [] },
      "2026-09-23T10:00:00Z",
    ),
  ).toContain("review candidate");
  expect(
    storageReviewSuggestion(
      { logicalBytes: 1_024, threads: [], modifiedAt: "2026-01-01T00:00:00Z" },
      "2026-09-23T10:00:00Z",
    ),
  ).toBe("Older unlinked history · review candidate");
  expect(
    storageReviewSuggestion(
      { logicalBytes: 1_024, threads: [], modifiedAt: "2026-09-23T09:00:00Z" },
      "2026-09-23T10:00:00Z",
    ),
  ).toBeNull();
});
