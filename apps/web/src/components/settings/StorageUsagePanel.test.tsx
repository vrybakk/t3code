import type { StorageUsageResult } from "@t3tools/contracts";
import { AsyncResult } from "effect/unstable/reactivity";
import { act, type ReactNode } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";

const fixtures = vi.hoisted(() => ({
  command: vi.fn(),
  scope: { environmentIds: ["first"] },
  connectedEnvironments: [
    {
      environmentId: "first",
      label: "First machine",
      serverConfig: { environment: { capabilities: { storageUsage: true } } },
    },
  ],
}));
vi.mock("../../state/storageUsage", () => ({ storageUsageGet: {} }));
vi.mock("../../state/use-atom-command", () => ({ useAtomCommand: () => fixtures.command }));
vi.mock("./SettingsScopeContext", () => ({ useSettingsScope: () => fixtures }));
vi.mock("./settingsLayout", () => ({
  SettingsSection: ({ children }: { children: ReactNode }) => <section>{children}</section>,
}));
vi.mock("../ui/button", () => ({ Button: "button" }));
vi.mock("../ui/input", () => ({ Input: "input" }));
vi.mock("../ui/tooltip", () => ({
  Tooltip: "div",
  TooltipTrigger: ({ children }: { children: ReactNode }) => <span>{children}</span>,
  TooltipPopup: "span",
}));

import { StorageUsagePanel } from "./StorageUsagePanel";
import {
  formatStorageBytes,
  storageHistoryLabel,
  storageHistoryStatus,
} from "./StorageUsage.logic";

const result: StorageUsageResult = {
  scannedAt: "2026-09-23T10:00:00.000Z",
  scanDurationMs: 240,
  totals: { logicalBytes: 1_024, allocatedBytes: null, fileCount: 1 },
  categories: [],
  totalHistories: 26,
  matchedHistories: 26,
  histories: [
    {
      filePath: "/codex/sessions/rollout.jsonl",
      provider: "codex",
      logicalBytes: 1_024,
      allocatedBytes: null,
      modifiedAt: "2026-09-23T09:00:00.000Z",
      archived: false,
      threads: [],
    },
  ],
  warnings: [],
  truncated: false,
};
let renderer: ReactTestRenderer | undefined;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  fixtures.scope.environmentIds = ["first"];
  fixtures.connectedEnvironments = [
    {
      environmentId: "first",
      label: "First machine",
      serverConfig: { environment: { capabilities: { storageUsage: true } } },
    },
  ];
  fixtures.command.mockResolvedValue(AsyncResult.success(result));
});
afterEach(async () => {
  await act(async () => renderer?.unmount());
  renderer = undefined;
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});
async function mount() {
  await act(async () => {
    renderer = create(<StorageUsagePanel />);
  });
}
async function click(label: string) {
  const button = renderer!.root
    .findAllByType("button")
    .find((item) => item.children.includes(label));
  expect(button).toBeDefined();
  await act(async () => button!.props.onClick());
}
function text() {
  return JSON.stringify(renderer!.toJSON());
}

it("only scans when requested and uses cached pages for pagination and search", async () => {
  await mount();
  expect(fixtures.command).not.toHaveBeenCalled();
  await click("Scan storage");
  expect(fixtures.command).toHaveBeenLastCalledWith({
    environmentId: "first",
    input: { refresh: true, search: "", offset: 0, limit: 25 },
  });
  expect(text()).toContain("rollout.jsonl");
  expect(text()).toContain("Unavailable");
  await click("Next");
  expect(fixtures.command).toHaveBeenLastCalledWith({
    environmentId: "first",
    input: { refresh: false, search: "", offset: 25, limit: 25 },
  });
  await act(async () =>
    renderer!.root.findByType("input").props.onChange({ target: { value: "project" } }),
  );
  await act(async () => renderer!.root.findByType("form").props.onSubmit({ preventDefault() {} }));
  expect(fixtures.command).toHaveBeenLastCalledWith({
    environmentId: "first",
    input: { refresh: false, search: "project", offset: 0, limit: 25 },
  });
  await click("Rescan storage");
  expect(renderer!.root.findByType("input").props.value).toBe("");
});

it("never silently substitutes a connected machine for a multi-machine selection", async () => {
  fixtures.scope.environmentIds = ["first", "offline"];
  await mount();
  expect(text()).toContain("Choose one machine");
  expect(renderer!.root.findAllByType("button")).toHaveLength(0);
  expect(fixtures.command).not.toHaveBeenCalled();
});

it("does not call an unsupported server", async () => {
  fixtures.connectedEnvironments[0]!.serverConfig.environment.capabilities.storageUsage = false;
  await mount();
  expect(text()).toContain("Update this machine");
  expect(fixtures.command).not.toHaveBeenCalled();
});

it("shows scan failures without replacing the last successful snapshot", async () => {
  await mount();
  await click("Scan storage");
  fixtures.command.mockResolvedValueOnce(AsyncResult.fail(new Error("Scan permission denied")));
  await click("Rescan storage");
  expect(text()).toContain("Scan permission denied");
  expect(text()).toContain("rollout.jsonl");
  await click("Rescan storage");
  expect(text()).not.toContain("Scan permission denied");
});

it("returns to the first page when a refreshed server snapshot shrinks", async () => {
  await mount();
  await click("Scan storage");
  fixtures.command.mockResolvedValueOnce(
    AsyncResult.success({ ...result, histories: [], matchedHistories: 1 }),
  );
  await click("Next");
  expect(fixtures.command).toHaveBeenLastCalledWith({
    environmentId: "first",
    input: { refresh: false, search: "", offset: 0, limit: 25 },
  });
  expect(text()).toContain("rollout.jsonl");
});

it("drops completed and in-flight results when changing machines", async () => {
  await mount();
  await click("Scan storage");
  let resolveScan!: (value: ReturnType<typeof AsyncResult.success<StorageUsageResult>>) => void;
  fixtures.command.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolveScan = resolve;
      }),
  );
  await click("Rescan storage");
  fixtures.scope.environmentIds = ["second"];
  fixtures.connectedEnvironments = [
    { ...fixtures.connectedEnvironments[0]!, environmentId: "second", label: "Second machine" },
  ];
  await act(async () => renderer!.update(<StorageUsagePanel />));
  expect(text()).not.toContain("rollout.jsonl");
  expect(text()).toContain("Second machine");
  await act(async () => resolveScan(AsyncResult.success(result)));
  expect(text()).not.toContain("rollout.jsonl");
  await click("Scan storage");
  expect(fixtures.command).toHaveBeenLastCalledWith({
    environmentId: "second",
    input: { refresh: true, search: "", offset: 0, limit: 25 },
  });
});

it("keeps unknown allocation distinct from zero and avoids unsafe unmatched labels", () => {
  expect(formatStorageBytes(null)).toBe("Unavailable");
  expect(formatStorageBytes(0)).toBe("0 B");
  expect(formatStorageBytes(1_024 ** 3)).toBe("1 GiB");
  expect(storageHistoryLabel(result.histories[0]!)).toBe("rollout.jsonl");
  expect(storageHistoryStatus(result.histories[0]!)).toBe("Unmatched");
});
