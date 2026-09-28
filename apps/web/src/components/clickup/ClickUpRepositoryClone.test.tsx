import {
  DEFAULT_SERVER_SETTINGS,
  EnvironmentId,
  ProjectId,
  type ClickUpTask,
} from "@t3tools/contracts";
import { act } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
  lookup: vi.fn(),
  start: vi.fn(),
  retry: vi.fn(),
  update: vi.fn(),
  clone: null as { phase: string; projectId: string; remoteUrl: string; error: string } | null,
}));
vi.mock("../../state/sourceControl", () => ({
  sourceControlEnvironment: {
    repository: "lookup",
    startProjectClone: "start",
    retryProjectClone: "retry",
  },
}));
vi.mock("../../state/server", () => ({ serverEnvironment: { updateSettings: "update" } }));
vi.mock("../../state/use-atom-query-runner", () => ({ useAtomQueryRunner: () => mocks.lookup }));
vi.mock("../../state/use-atom-command", () => ({
  useAtomCommand: (name: "start" | "retry" | "update") => mocks[name],
}));
vi.mock("../../state/projectClones", () => ({
  useEnvironmentProjectClones: () => (mocks.clone ? [mocks.clone] : []),
  useProjectClone: () => mocks.clone,
}));
vi.mock("../../state/entities", () => ({
  useServerConfigs: () =>
    new Map([
      [
        "env",
        {
          environment: {
            capabilities: { projectCloneTracking: true, clickUpRepositorySetup: true },
          },
        },
      ],
    ]),
}));
vi.mock("../../hooks/useSettings", () => ({
  useEnvironmentSettings: (_: unknown, selector: (settings: unknown) => unknown) =>
    selector({
      ...DEFAULT_SERVER_SETTINGS,
      clickUpRepositoryMappings: {
        "42:list::api": [{ remoteUrl: "https://github.com/company/api" }],
      },
    }),
}));
vi.mock("../../lib/utils", () => ({ newProjectId: () => "cloned" }));
vi.mock("../ui/button", () => ({ Button: "button" }));
vi.mock("../ui/input", () => ({ Input: "input" }));
import { ClickUpRepositoryClone } from "./ClickUpRepositoryClone";
const task: ClickUpTask = {
  workspaceId: "42",
  taskId: "t",
  name: "Task",
  status: "To do",
  description: "",
  listName: "API",
  sources: [{ kind: "list", id: "api", name: "API" }],
};
let renderer: ReactTestRenderer;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.clearAllMocks();
  mocks.clone = null;
  for (const command of [mocks.lookup, mocks.start, mocks.retry, mocks.update])
    command.mockResolvedValue({ _tag: "Success", value: {} });
});
afterEach(async () => {
  await act(async () => renderer?.unmount());
  vi.unstubAllGlobals();
});
async function mount() {
  await act(async () => {
    renderer = create(
      <ClickUpRepositoryClone
        environmentId={EnvironmentId.make("env")}
        task={task}
        repository={{ remoteUrl: "https://github.com/company/api" }}
      />,
    );
  });
}
async function click(label: string) {
  const button = renderer.root
    .findAllByType("button")
    .find((node) => node.children.includes(label));
  expect(button).toBeDefined();
  await act(async () => button!.props.onClick());
}
async function destination(path: string) {
  await act(async () =>
    renderer.root.findByType("input").props.onChange({ target: { value: path } }),
  );
}
it("checks GitHub access before offering location confirmation and never clones on lookup failure", async () => {
  mocks.lookup.mockResolvedValue({ _tag: "Failure" });
  await mount();
  expect(mocks.lookup).not.toHaveBeenCalled();
  await click("Set up repository");
  expect(mocks.lookup).toHaveBeenCalledWith({
    environmentId: "env",
    input: { provider: "github", repository: "company/api" },
  });
  expect(mocks.start).not.toHaveBeenCalled();
  expect(renderer.root.findAllByType("input")).toHaveLength(0);
});
it("requires an absolute location and saves the confirmed clone once", async () => {
  await mount();
  await click("Set up repository");
  await destination("relative/path");
  await click("Confirm location and download");
  expect(mocks.start).not.toHaveBeenCalled();
  await destination("/Projects/api");
  await click("Confirm location and download");
  expect(mocks.start).toHaveBeenCalledExactlyOnceWith({
    environmentId: "env",
    input: {
      projectId: "cloned",
      title: "api",
      createdAt: expect.any(String),
      provider: "github",
      repository: "company/api",
      destinationPath: "/Projects/api",
    },
  });
  expect(mocks.update).toHaveBeenCalledWith({
    environmentId: "env",
    input: {
      patch: {
        clickUpRepositoryMappings: {
          "42:list::api": [
            { remoteUrl: "https://github.com/company/api", projectId: ProjectId.make("cloned") },
          ],
        },
        clickUpProjectMappings: { "42:list::api": [] },
      },
    },
  });
});
it("retries a failed binding save without cloning again", async () => {
  mocks.update.mockResolvedValueOnce({ _tag: "Failure" });
  await mount();
  await click("Set up repository");
  await destination("/Projects/api");
  await click("Confirm location and download");
  await click("Retry saving link");
  expect(mocks.start).toHaveBeenCalledTimes(1);
  expect(mocks.update).toHaveBeenCalledTimes(2);
});
it("reuses the tracked clone after reopening instead of asking for another destination", async () => {
  mocks.clone = {
    phase: "failed",
    projectId: "existing",
    remoteUrl: "git@github.com:company/api.git",
    error: "Network unavailable",
  };
  await mount();
  await click("Retry download");
  expect(mocks.retry).toHaveBeenCalledWith({
    environmentId: "env",
    input: { projectId: "existing" },
  });
  expect(mocks.start).not.toHaveBeenCalled();
  expect(mocks.lookup).not.toHaveBeenCalled();
});
it("can recover when the server loses a tracked download", async () => {
  mocks.clone = {
    phase: "running",
    projectId: "existing",
    remoteUrl: "https://github.com/company/api",
    error: "",
  };
  await mount();
  mocks.clone = null;
  await act(async () =>
    renderer.update(
      <ClickUpRepositoryClone
        environmentId={EnvironmentId.make("env")}
        task={task}
        repository={{ remoteUrl: "https://github.com/company/api" }}
      />,
    ),
  );
  await click("Set up again");
  await click("Set up repository");
  expect(renderer.root.findAllByType("input")).toHaveLength(1);
  expect(mocks.start).not.toHaveBeenCalled();
});
