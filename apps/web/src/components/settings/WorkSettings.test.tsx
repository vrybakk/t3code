import { act, type ReactNode } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const state = vi.hoisted(() => ({
  kind: "all",
  environmentId: "remote",
  connectedIds: ["local", "remote"],
  useWorkData: vi.fn(() => ({ overview: null, timeZone: "UTC", loading: true })),
  useWorkMutations: vi.fn(() => ({})),
}));

vi.mock("./SettingsScopeContext", () => ({
  useSettingsScope: () => ({
    scope: { kind: state.kind, environmentId: state.environmentId, label: "Remote machine" },
    connectedEnvironments: state.connectedIds.map((environmentId) => ({ environmentId })),
  }),
}));
vi.mock("./SettingsScopeNotice", () => ({
  SettingsScopeNotice: ({ children }: { children: ReactNode }) => <p>{children}</p>,
}));
vi.mock("./settingsLayout", () => ({
  SettingsPageContainer: ({ children }: { children: ReactNode }) => children,
  SettingsSearchTarget: ({ children }: { children: ReactNode }) => children,
  SettingsSection: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("../work/useWorkData", () => ({ useWorkData: state.useWorkData }));
vi.mock("../../state/workTracking", () => ({ useWorkMutations: state.useWorkMutations }));
vi.mock("../work/WorkBackupActions", () => ({ WorkBackupActions: () => null }));
vi.mock("../work/WorkProfileForm", () => ({ WorkProfileForm: () => null }));
vi.mock("../work/WorkRepositoryReview", () => ({ WorkRepositoryReview: () => null }));
vi.mock("../work/WorkSelect", () => ({ WorkSelect: () => null }));

import { WorkSettingsPanel } from "./WorkSettings";

let renderer: ReactTestRenderer | null = null;
beforeEach(() => {
  state.kind = "all";
  state.environmentId = "remote";
  state.connectedIds = ["local", "remote"];
  vi.clearAllMocks();
});
afterEach(() => {
  act(() => renderer?.unmount());
  renderer = null;
});

describe("Work settings environment ownership", () => {
  it.each(["all", "project", "checkout", "unavailable"])(
    "requires an explicit environment instead of loading a ledger for %s scope",
    (kind) => {
      state.kind = kind;
      act(() => {
        renderer = create(<WorkSettingsPanel />);
      });
      expect(JSON.stringify(renderer!.toJSON())).toContain("Choose one environment");
      expect(state.useWorkData).not.toHaveBeenCalled();
      expect(state.useWorkMutations).not.toHaveBeenCalled();
    },
  );

  it("does not fall back to a connected local machine when the selected environment is offline", () => {
    state.kind = "environment";
    state.connectedIds = ["local"];
    act(() => {
      renderer = create(<WorkSettingsPanel />);
    });
    expect(JSON.stringify(renderer!.toJSON())).toContain("Reconnect ");
    expect(state.useWorkData).not.toHaveBeenCalled();
    expect(state.useWorkMutations).not.toHaveBeenCalled();
  });

  it("loads and binds mutations only to the explicit connected environment", () => {
    state.kind = "environment";
    act(() => {
      renderer = create(<WorkSettingsPanel />);
    });
    expect(state.useWorkData).toHaveBeenCalledWith("remote");
    expect(state.useWorkMutations).toHaveBeenCalledWith("remote");
    state.environmentId = "local";
    act(() => renderer!.update(<WorkSettingsPanel />));
    expect(state.useWorkData).toHaveBeenLastCalledWith("local");
    expect(state.useWorkMutations).toHaveBeenLastCalledWith("local");
  });
});
