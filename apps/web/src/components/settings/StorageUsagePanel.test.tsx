import { StorageUsageError, type StorageUsageResult } from "@t3tools/contracts";
import { AsyncResult } from "effect/unstable/reactivity";
import { act, cloneElement, type ReactElement, type ReactNode } from "react";
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
vi.mock("../../state/session", () => ({
  useEnvironmentSessionState: () => ({ data: null, isPending: false, hasError: false }),
}));
vi.mock("../../state/use-atom-command", () => ({ useAtomCommand: () => fixtures.command }));
vi.mock("./SettingsScopeContext", () => ({ useSettingsScope: () => fixtures }));
vi.mock("./settingsLayout", () => ({
  SettingsSection: ({ children }: { children: ReactNode }) => <section>{children}</section>,
}));
vi.mock("../ui/button", () => ({ Button: "button" }));
vi.mock("../ui/input", () => ({ Input: "input" }));
vi.mock("../ui/tooltip", () => ({
  Tooltip: "div",
  TooltipTrigger: ({
    children,
    render,
  }: {
    children: ReactNode;
    render?: ReactElement<{ children?: ReactNode }>;
  }) => (render ? cloneElement(render, {}, children) : <span>{children}</span>),
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
  fixtures.command.mockReset().mockResolvedValue(AsyncResult.success(result));
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
    .find((item) => item.children.filter((child) => typeof child === "string").join("") === label);
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
    input: { refresh: true, view: "groups", search: "", offset: 0, limit: 25 },
  });
  expect(text()).toContain("rollout.jsonl");
  expect(text()).toContain("Unavailable");
  await click("Next");
  expect(fixtures.command).toHaveBeenLastCalledWith({
    environmentId: "first",
    input: { refresh: false, view: "histories", search: "", offset: 25, limit: 25 },
  });
  await act(async () =>
    renderer!.root.findByType("input").props.onChange({ target: { value: "project" } }),
  );
  await act(async () => renderer!.root.findByType("form").props.onSubmit({ preventDefault() {} }));
  expect(fixtures.command).toHaveBeenLastCalledWith({
    environmentId: "first",
    input: { refresh: false, view: "histories", search: "project", offset: 0, limit: 25 },
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
    input: { refresh: false, view: "histories", search: "", offset: 0, limit: 25 },
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
    input: { refresh: true, view: "groups", search: "", offset: 0, limit: 25 },
  });
});

it("keeps unknown allocation distinct from zero and avoids unsafe unmatched labels", () => {
  expect(formatStorageBytes(null)).toBe("Unavailable");
  expect(formatStorageBytes(0)).toBe("0 B");
  expect(formatStorageBytes(1_024 ** 3)).toBe("1 GiB");
  expect(storageHistoryLabel(result.histories[0]!)).toBe("rollout.jsonl");
  expect(storageHistoryStatus(result.histories[0]!)).toBe("Unmatched");
});

const group = {
  id: "group-a",
  label: "Parent conversation",
  threads: [],
  logicalBytes: 2_048,
  allocatedBytes: 4_096,
  fileCount: 2,
  subagentCount: 1,
  parentMissing: false,
};
const grouped: StorageUsageResult = {
  ...result,
  snapshotId: "scan-a",
  groups: [group],
  totalGroups: 1,
  matchedGroups: 1,
  histories: [],
};
const folder = {
  id: "folder-a",
  name: "sessions",
  path: "/codex/sessions",
  kind: "directory" as const,
  status: "measured" as const,
  logicalBytes: 2_048,
  allocatedBytes: 4_096,
  fileCount: 2,
};

it("expands combined conversations into cached members and returns to groups", async () => {
  fixtures.command.mockResolvedValueOnce(AsyncResult.success(grouped));
  await mount();
  await click("Scan storage");
  expect(text()).toContain("Parent conversation");
  fixtures.command.mockResolvedValueOnce(
    AsyncResult.success({
      ...result,
      snapshotId: "scan-a",
      histories: [{ ...result.histories[0]!, relationship: "subagent" }],
    }),
  );
  await click("Parent conversation");
  expect(fixtures.command).toHaveBeenLastCalledWith({
    environmentId: "first",
    input: {
      refresh: false,
      view: "histories",
      groupId: "group-a",
      snapshotId: "scan-a",
      search: "",
      offset: 0,
      limit: 25,
    },
  });
  expect(text()).toContain("Subagent history");
  fixtures.command.mockResolvedValueOnce(AsyncResult.success(grouped));
  await click("Back to conversations");
  expect(fixtures.command).toHaveBeenLastCalledWith({
    environmentId: "first",
    input: {
      refresh: false,
      view: "groups",
      snapshotId: "scan-a",
      search: "",
      offset: 0,
      limit: 25,
    },
  });
  expect(text()).toContain("Parent conversation");
});

it("browses and paginates cached directories without rescanning and preserves results between views", async () => {
  fixtures.command.mockResolvedValueOnce(AsyncResult.success(grouped));
  await mount();
  await click("Scan storage");
  await act(async () => renderer!.update(<StorageUsagePanel section="breakdown" />));
  fixtures.command.mockResolvedValueOnce(
    AsyncResult.success({
      ...grouped,
      directory: { current: null, breadcrumbs: [], entries: [folder], totalEntries: 1 },
    }),
  );
  await click("Browse folders");
  const contents = {
    ...grouped,
    directory: {
      current: folder,
      breadcrumbs: [folder],
      entries: [{ ...folder, id: "file-a", name: "rollout.jsonl", kind: "file" as const }],
      totalEntries: 26,
    },
  };
  fixtures.command.mockResolvedValueOnce(AsyncResult.success(contents));
  await click("sessions/");
  expect(fixtures.command).toHaveBeenLastCalledWith({
    environmentId: "first",
    input: {
      refresh: false,
      view: "directory",
      directoryId: "folder-a",
      snapshotId: "scan-a",
      search: "",
      offset: 0,
      limit: 25,
    },
  });
  fixtures.command.mockResolvedValueOnce(AsyncResult.success(contents));
  await click("Next");
  expect(fixtures.command).toHaveBeenLastCalledWith({
    environmentId: "first",
    input: {
      refresh: false,
      view: "directory",
      directoryId: "folder-a",
      snapshotId: "scan-a",
      search: "",
      offset: 25,
      limit: 25,
    },
  });
  const calls = fixtures.command.mock.calls.length;
  await act(async () => renderer!.update(<StorageUsagePanel section="histories" />));
  await act(async () => renderer!.update(<StorageUsagePanel section="breakdown" />));
  expect(fixtures.command.mock.calls).toHaveLength(calls);
  expect(text()).toContain("rollout.jsonl");
  expect(
    renderer!.root
      .findAllByType("button")
      .some((button) => button.children.includes("rollout.jsonl")),
  ).toBe(false);
});

it("clears stale navigation and requires a fresh explicit scan", async () => {
  fixtures.command.mockResolvedValueOnce(AsyncResult.success(grouped));
  await mount();
  await click("Scan storage");
  fixtures.command.mockResolvedValueOnce(
    AsyncResult.fail(
      new StorageUsageError({ detail: "Snapshot changed. Scan again.", reason: "stale-snapshot" }),
    ),
  );
  await click("Parent conversation");
  expect(text()).toContain("Snapshot changed. Scan again.");
  expect(text()).not.toContain("Parent conversation");
  expect(fixtures.command).toHaveBeenCalledTimes(2);
  await click("Scan storage");
  expect(fixtures.command).toHaveBeenLastCalledWith({
    environmentId: "first",
    input: { refresh: true, view: "groups", search: "", offset: 0, limit: 25 },
  });
});
