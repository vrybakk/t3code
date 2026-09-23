import { EnvironmentId } from "@t3tools/contracts";
import { AsyncResult } from "effect/unstable/reactivity";
import { act, type ReactNode } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
  review: vi.fn(),
  load: vi.fn(),
  scopes: ["orchestration:operate"],
}));
vi.mock("../../state/session", () => ({
  useEnvironmentSessionState: () => ({
    data: { authenticated: true, scopes: mocks.scopes },
    isPending: false,
    hasError: false,
  }),
}));
vi.mock("../../state/storageUsage", () => ({ storageReviewCleanup: {} }));
vi.mock("../../state/use-atom-command", () => ({ useAtomCommand: () => mocks.review }));
vi.mock("../ui/button", () => ({ Button: "button" }));
vi.mock("../ui/input", () => ({ Input: "input" }));
vi.mock("../ui/checkbox", () => ({
  Checkbox: ({
    checked,
    onCheckedChange,
    ...props
  }: {
    checked: boolean;
    onCheckedChange: (next: boolean) => void;
  }) => (
    <button
      {...props}
      role="checkbox"
      aria-checked={checked}
      onClick={() => onCheckedChange(!checked)}
    />
  ),
}));
vi.mock("../ui/tooltip", () => ({
  Tooltip: "div",
  TooltipTrigger: ({ children }: { children: ReactNode }) => <span>{children}</span>,
  TooltipPopup: "span",
}));
vi.mock("./StorageCleanupDialog", () => ({
  StorageCleanupDialog: () => <div role="dialog">Reviewed selection</div>,
}));

import { StorageHistoryManager } from "./StorageHistoryManager";
import type { StorageUsagePage } from "./StorageUsageState";

const environmentId = EnvironmentId.make("first");
const page: StorageUsagePage = {
  query: { view: "groups", search: "", offset: 0 },
  result: {
    scannedAt: "2026-09-23T10:00:00Z",
    scanDurationMs: 10,
    snapshotId: "scan-a",
    totals: { logicalBytes: 1_024, allocatedBytes: 4_096, fileCount: 1 },
    categories: [],
    histories: [],
    groups: [
      {
        id: "group-a",
        label: "Parent",
        threads: [],
        logicalBytes: 1_024,
        allocatedBytes: 4_096,
        fileCount: 1,
        subagentCount: 0,
        parentMissing: false,
      },
    ],
    totalGroups: 1,
    matchedGroups: 1,
    totalHistories: 1,
    matchedHistories: 1,
    warnings: [],
    truncated: false,
  },
};
let renderer: ReactTestRenderer | undefined;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocks.scopes = ["orchestration:operate"];
  mocks.review
    .mockReset()
    .mockResolvedValue(
      AsyncResult.success({
        planId: "review-a",
        expiresAt: "2026-09-23T11:00:00Z",
        trashSupported: true,
        eligibleCount: 0,
        blockedCount: 0,
        totals: page.result.totals,
        items: [],
        warnings: [],
      }),
    );
});
afterEach(async () => {
  await act(async () => renderer?.unmount());
  renderer = undefined;
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});
async function mount(cleanupSupported = true) {
  await act(async () => {
    renderer = create(
      <StorageHistoryManager
        key="scan-a"
        environmentId={environmentId}
        label="First machine"
        cleanupSupported={cleanupSupported}
        page={page}
        loading={false}
        load={mocks.load}
      />,
    );
  });
}

it("keeps old servers and read-only sessions non-destructive", async () => {
  await mount(false);
  expect(renderer!.root.findAllByProps({ role: "checkbox" })).toHaveLength(0);
  mocks.scopes = ["orchestration:read"];
  await act(async () =>
    renderer!.update(
      <StorageHistoryManager
        environmentId={environmentId}
        label="First machine"
        cleanupSupported
        page={page}
        loading={false}
        load={mocks.load}
      />,
    ),
  );
  expect(renderer!.root.findAllByProps({ role: "checkbox" })).toHaveLength(0);
  expect(mocks.review).not.toHaveBeenCalled();
});

it("retains group and individual selections across pages but only previews opaque IDs", async () => {
  await mount();
  await act(async () => renderer!.root.findByProps({ role: "checkbox" }).props.onClick());
  const members: StorageUsagePage = {
    query: { view: "histories", groupId: "group-a", search: "", offset: 0 },
    result: {
      ...page.result,
      histories: [
        {
          id: "history-a",
          filePath: "/provider/a.jsonl",
          provider: "codex",
          logicalBytes: 1_024,
          allocatedBytes: 4_096,
          modifiedAt: "2026-09-23T09:00:00Z",
          archived: false,
          threads: [],
        },
      ],
    },
  };
  await act(async () =>
    renderer!.update(
      <StorageHistoryManager
        key="scan-a"
        environmentId={environmentId}
        label="First machine"
        cleanupSupported
        page={members}
        loading={false}
        load={mocks.load}
      />,
    ),
  );
  await act(async () => renderer!.root.findByProps({ role: "checkbox" }).props.onClick());
  const review = renderer!.root
    .findAllByType("button")
    .find((node) => node.children.includes("Review cleanup"))!;
  await act(async () => review.props.onClick());
  expect(mocks.review).toHaveBeenCalledWith({
    environmentId,
    input: { snapshotId: "scan-a", groupIds: ["group-a"], historyIds: ["history-a"] },
  });
  expect(mocks.load).not.toHaveBeenCalled();
});

it("resets selections on a new snapshot", async () => {
  await mount();
  await act(async () => renderer!.root.findByProps({ role: "checkbox" }).props.onClick());
  expect(renderer!.root.findByProps({ role: "checkbox" }).props["aria-checked"]).toBe(true);
  await act(async () =>
    renderer!.update(
      <StorageHistoryManager
        key="scan-b"
        environmentId={environmentId}
        label="First machine"
        cleanupSupported
        page={{ ...page, result: { ...page.result, snapshotId: "scan-b" } }}
        loading={false}
        load={mocks.load}
      />,
    ),
  );
  expect(renderer!.root.findByProps({ role: "checkbox" }).props["aria-checked"]).toBe(false);
});
