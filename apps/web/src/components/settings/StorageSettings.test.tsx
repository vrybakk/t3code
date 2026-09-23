import { DEFAULT_SERVER_SETTINGS, type StorageUsageResult } from "@t3tools/contracts";
import { AsyncResult } from "effect/unstable/reactivity";
import { act, type ReactNode } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({ command: vi.fn(), update: vi.fn(), clear: vi.fn() }));
vi.mock("../../state/storageUsage", () => ({ storageUsageGet: {} }));
vi.mock("../../state/use-atom-command", () => ({ useAtomCommand: () => mocks.command }));
vi.mock("./useScopedSettings", () => ({
  useScopedSettings: () => DEFAULT_SERVER_SETTINGS,
  useUpdateScopedSettings: () => mocks.update,
  useClearScopedSettings: () => mocks.clear,
}));
vi.mock("./SettingsScopeContext", () => ({
  useSettingsScope: () => ({
    scope: { kind: "environment", environmentIds: ["first"] },
    connectedEnvironments: [
      {
        environmentId: "first",
        label: "First machine",
        serverConfig: {
          environment: { capabilities: { storageUsage: true, storageCleanup: true } },
        },
      },
    ],
    targets: [],
    target: null,
    selectScope: vi.fn(),
  }),
}));
vi.mock("./settingsLayout", () => ({
  SettingsPageContainer: ({ children }: { children: ReactNode }) => <main>{children}</main>,
  SettingsSection: ({ children, title }: { children: ReactNode; title: string }) => (
    <section>
      <h2>{title}</h2>
      {children}
    </section>
  ),
  SettingsRow: ({ title, control }: { title: string; control: ReactNode }) => (
    <div>
      {title}
      {control}
    </div>
  ),
}));
vi.mock("../ui/button", () => ({ Button: "button" }));
vi.mock("../ui/input", () => ({ Input: "input" }));
vi.mock("../ui/switch", () => ({ Switch: "input" }));
vi.mock("../ui/number-field", () => ({
  NumberField: "div",
  NumberFieldDecrement: "button",
  NumberFieldGroup: "div",
  NumberFieldIncrement: "button",
  NumberFieldInput: "input",
}));
vi.mock("../ui/select", () => ({
  Select: "div",
  SelectItem: "span",
  SelectPopup: "div",
  SelectTrigger: "button",
  SelectValue: "span",
}));
vi.mock("../ui/tooltip", () => ({
  Tooltip: "div",
  TooltipTrigger: ({ children }: { children: ReactNode }) => <span>{children}</span>,
  TooltipPopup: "span",
}));
vi.mock("@base-ui/react/tabs", async () => {
  const { createContext, useContext } = await import("react");
  const Context = createContext<(value: string) => void>(() => {});
  return {
    Tabs: {
      Root: ({
        children,
        onValueChange,
      }: {
        children: ReactNode;
        onValueChange: (value: string) => void;
      }) => <Context value={onValueChange}>{children}</Context>,
      List: ({ children }: { children: ReactNode }) => <div role="tablist">{children}</div>,
      Tab: ({ children, value }: { children: ReactNode; value: string }) => {
        const onChange = useContext(Context);
        return (
          <button role="tab" onClick={() => onChange(value)}>
            {children}
          </button>
        );
      },
    },
  };
});

import { StorageSettingsPanel } from "./StorageSettings";

const result: StorageUsageResult = {
  scannedAt: "2026-09-23T10:00:00.000Z",
  scanDurationMs: 10,
  snapshotId: "scan-a",
  totals: { logicalBytes: 3_072, allocatedBytes: 4_096, fileCount: 1 },
  categories: [],
  histories: [],
  groups: [
    {
      id: "group-a",
      label: "Remember this conversation",
      threads: [],
      logicalBytes: 3_072,
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
};
let renderer: ReactTestRenderer | undefined;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocks.command.mockResolvedValue(AsyncResult.success(result));
});
afterEach(async () => {
  await act(async () => renderer?.unmount());
  renderer = undefined;
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});
async function click(label: string) {
  const button = renderer!.root
    .findAllByType("button")
    .find((node) => node.children.includes(label));
  expect(button).toBeDefined();
  await act(async () => button!.props.onClick());
}

it("keeps the scan across Usage, Settings and nested views without rescans or cleanup writes", async () => {
  await act(async () => {
    renderer = create(<StorageSettingsPanel />);
  });
  expect(mocks.command).not.toHaveBeenCalled();
  await click("Scan storage");
  for (const label of ["Breakdown", "Histories", "Settings", "Usage", "Overview", "Histories"])
    await click(label);
  expect(mocks.command).toHaveBeenCalledTimes(1);
  expect(mocks.update).not.toHaveBeenCalled();
  expect(mocks.clear).not.toHaveBeenCalled();
  expect(JSON.stringify(renderer!.toJSON())).toContain("Remember this conversation");
  const panels = renderer!.root.findAll((node) => node.props.role === "tabpanel");
  expect(panels[0]!.props["aria-labelledby"]).toBe("storage-tab-usage");
  expect(panels[1]!.props["aria-labelledby"]).toBe("storage-usage-tab-histories");
  expect(panels[0]!.props.id).not.toBe(panels[1]!.props.id);
  expect(
    renderer!.root.findAllByType("h2").some((node) => node.children.includes("Worktrees")),
  ).toBe(true);
  expect(
    renderer!.root.findAllByType("h2").some((node) => node.children.includes("Artifacts and logs")),
  ).toBe(true);
});
