import {
  DEFAULT_SERVER_SETTINGS,
  EnvironmentId,
  ProjectId,
  type ClickUpTaskDetails,
  type ClickUpLocalRepository,
} from "@t3tools/contracts";
import { AsyncResult } from "effect/unstable/reactivity";
import { act } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { createMemoryStorage } from "../../lib/storage";

const mocks = vi.hoisted(() => ({
  newThread: vi.fn(),
  checkouts: [] as ClickUpLocalRepository[],
  checking: false,
  repositories: {} as Record<string, { remoteUrl: string }[]>,
  clones: [] as { projectId: string; phase: string; destinationPath?: string }[],
  mappings: {} as Record<string, string[]>,
  setPrompt: vi.fn(),
  setInteractionMode: vi.fn(),
  setDraftThreadContext: vi.fn(),
}));
vi.mock("@effect/atom-react", () => ({
  useAtomValue: () =>
    mocks.checking ? AsyncResult.initial() : AsyncResult.success(mocks.checkouts),
}));
vi.mock("../../state/server", () => ({ serverEnvironment: { clickUpLocalRepositories: vi.fn() } }));
vi.mock("../../rpc/atomRegistry", () => ({ appAtomRegistry: { refresh: vi.fn() } }));
vi.mock("./ClickUpRepositoryMappings", () => ({ ClickUpRepositoryMappings: "manage-links" }));
vi.mock("./ClickUpRepositoryClone", () => ({ ClickUpRepositoryClone: "clone-repo" }));
vi.mock("../ui/spinner", () => ({ Spinner: "svg" }));
vi.mock("../../composerDraftStore", () => ({ useComposerDraftStore: { getState: () => mocks } }));
vi.mock("../../hooks/useHandleNewThread", () => ({ useNewThreadHandler: () => mocks.newThread }));
vi.mock("../../hooks/useSettings", () => ({
  useEnvironmentSettings: (_: unknown, selector: (settings: unknown) => unknown) =>
    selector({
      ...DEFAULT_SERVER_SETTINGS,
      clickUpProjectMappings: mocks.mappings,
      clickUpRepositoryMappings: mocks.repositories,
    }),
}));
vi.mock("../../state/entities", () => ({
  useServerConfigs: () =>
    new Map([["test", { environment: { capabilities: { clickUpLocalRepositories: true } } }]]),
  useProjects: () => [
    { id: "repo", environmentId: "test", title: "API", workspaceRoot: "/workspace" },
    { id: "web", environmentId: "test", title: "Website" },
    { id: "other", environmentId: "remote", title: "Other environment" },
  ],
}));
vi.mock("../../state/projectClones", () => ({ useEnvironmentProjectClones: () => mocks.clones }));
vi.mock("./ClickUpLinkedRepositories", () => ({
  ClickUpLinkedRepositories: "linked-repositories",
}));
vi.mock("./ClickUpWorkflowModels", () => ({ ClickUpWorkflowModelPicker: "model-picker" }));
vi.mock("../ui/button", () => ({ Button: "button" }));
vi.mock("../ui/select", () => ({
  Select: "select",
  SelectItem: "option",
  SelectPopup: "div",
  SelectTrigger: "div",
  SelectValue: "span",
}));
import { ClickUpTaskLauncher } from "./ClickUpTaskLauncher";

const details: ClickUpTaskDetails = {
  task: {
    workspaceId: "42",
    taskId: "task",
    name: "Fix checkout",
    status: "To do",
    listName: "Sprint",
    description: "Handle empty carts",
    sources: [{ kind: "list", id: "list", name: "API" }],
  },
  comments: [{ id: "comment", author: "PM", text: "Check mobile too" }],
  commentsMayHaveMore: false,
  attachments: [],
};
let renderer: ReactTestRenderer;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.clearAllMocks();
  vi.stubGlobal(
    "window",
    Object.assign(new EventTarget(), { localStorage: createMemoryStorage() }),
  );
  mocks.mappings = { "42:list::list": ["repo"] };
  mocks.repositories = {};
  mocks.clones = [];
  mocks.checkouts = [];
  mocks.checking = false;
  mocks.newThread.mockResolvedValue({ draftId: "draft" });
});
afterEach(async () => {
  await act(async () => renderer?.unmount());
  vi.unstubAllGlobals();
});
async function mount(taskDetails = details) {
  await act(async () => {
    renderer = create(
      <ClickUpTaskLauncher environmentId={EnvironmentId.make("test")} details={taskDetails} />,
    );
  });
}
function prepare() {
  return renderer.root
    .findAllByType("button")
    .find((button) => button.children.includes("Prepare thread"))!;
}
it("prepares a linked implementation draft with a skill and compact context", async () => {
  const mode = "default";
  await mount();
  expect(renderer.root.findByType("select").props.value).toBe("repo");
  expect(renderer.root.findAllByType("option")).toHaveLength(1);
  await act(async () => prepare().props.onClick());
  expect(mocks.newThread).toHaveBeenCalledWith(
    { environmentId: EnvironmentId.make("test"), projectId: ProjectId.make("repo") },
    { envMode: "worktree" },
  );
  expect(mocks.setInteractionMode).toHaveBeenCalledWith("draft", mode);
  expect(mocks.setDraftThreadContext).toHaveBeenCalledWith("draft", {
    clickUpTask: { taskId: "task", workspaceId: "42", name: "Fix checkout" },
    environmentSelection: "manual",
    interactionMode: mode,
  });
  const prompt = mocks.setPrompt.mock.calls[0]?.[1] as string;
  expect(prompt).toContain("$studio-task-workflow Start task task: Fix checkout");
  expect(prompt).toContain('mode "implement"');
  expect(prompt).toContain('"research":null');
  expect(prompt).toContain('"id":"repo"');
  expect(prompt).not.toContain("Handle empty carts");
  expect(prompt).not.toContain("PM: Check mobile too");
});
it("does not write draft context after launch fails", async () => {
  mocks.newThread.mockRejectedValue(new Error("Unavailable"));
  await mount();
  await act(async () => prepare().props.onClick());
  expect(mocks.setPrompt).not.toHaveBeenCalled();
  expect(mocks.setDraftThreadContext).not.toHaveBeenCalled();
  expect(renderer.root.findByProps({ role: "alert" }).children.join("")).toContain(
    "Could not prepare",
  );
});

it("remembers a manually selected repository for the next task in the same location", async () => {
  mocks.mappings = { "42:list::list": ["repo", "web"] };
  await mount();
  expect(renderer.root.findByType("select").props.value).toBe("repo");
  await act(async () => renderer.root.findByType("select").props.onValueChange("web"));
  await act(async () => renderer.unmount());
  await mount({ ...details, task: { ...details.task, taskId: "next-task" } });
  await act(async () => prepare().props.onClick());
  expect(mocks.newThread).toHaveBeenCalledWith(
    { environmentId: "test", projectId: "web" },
    { envMode: "worktree" },
  );
  const prompt = mocks.setPrompt.mock.calls[0]?.[1] as string;
  expect(prompt).toContain('"id":"repo"');
  expect(prompt).toContain('"id":"web"');
});

it("preselects a project without a saved mapping while keeping manual selection available", async () => {
  mocks.mappings = {};
  await mount();
  expect(renderer.root.findByType("select").props.value).toBe("repo");
  await act(async () => renderer.root.findByType("select").props.onValueChange("web"));
  await act(async () => renderer.unmount());
  await mount({ ...details, task: { ...details.task, taskId: "next-task" } });
  expect(renderer.root.findByType("select").props.value).toBe("web");
});

it("restores a deliberate choice outside the linked repositories when the dialog reopens", async () => {
  await mount();
  await act(async () =>
    renderer.root
      .findAllByType("button")
      .find((button) => button.children.includes("Show all repositories"))!
      .props.onClick(),
  );
  await act(async () => renderer.root.findByType("select").props.onValueChange("web"));
  await act(async () => renderer.unmount());
  await mount({ ...details, task: { ...details.task, taskId: "next-task" } });
  expect(renderer.root.findByType("select").props.value).toBe("web");
  await act(async () => prepare().props.onClick());
  expect(mocks.newThread).toHaveBeenCalledWith(
    { environmentId: "test", projectId: "web" },
    { envMode: "worktree" },
  );
});

it("blocks implementation for no agent tasks", async () => {
  const tagged = { ...details, task: { ...details.task, tags: ["no agent"] } };
  await mount(tagged);
  expect(prepare().props.disabled).toBe(true);
  await act(async () => prepare().props.onClick());
  expect(mocks.newThread).not.toHaveBeenCalled();
});

it("does not prepare work while a required repository is missing", async () => {
  mocks.repositories = { "42:list::list": [{ remoteUrl: "https://github.com/company/missing" }] };
  await mount();
  expect(prepare().props.disabled).toBe(true);
  await act(async () => prepare().props.onClick());
  expect(mocks.newThread).not.toHaveBeenCalled();
});
it.each(["running", "failed", "cancelled"])(
  "does not prepare work from a %s clone",
  async (phase) => {
    mocks.clones = [{ projectId: "repo", phase }];
    await mount();
    expect(prepare().props.disabled).toBe(true);
    await act(async () => prepare().props.onClick());
    expect(mocks.newThread).not.toHaveBeenCalled();
  },
);

const nestedRepository = {
  projectId: ProjectId.make("repo"),
  remoteUrl: "https://github.com/company/api",
  cwd: "/workspace/api",
};
it("uses verified nested repositories without creating a worktree at the parent folder", async () => {
  mocks.repositories = { "42:list::list": [{ remoteUrl: nestedRepository.remoteUrl }] };
  mocks.checkouts = [nestedRepository];
  await mount();
  expect(prepare().props.disabled).toBe(false);
  await act(async () => prepare().props.onClick());
  expect(mocks.newThread).toHaveBeenCalledWith(
    { environmentId: "test", projectId: "repo" },
    { envMode: "local" },
  );
  expect(mocks.setPrompt.mock.calls[0]?.[1]).toContain('"cwd":"/workspace/api"');
});
it.each(["running", "failed", "cancelled"])(
  "does not use a nested checkout from a %s clone",
  async (phase) => {
    mocks.repositories = { "42:list::list": [{ remoteUrl: nestedRepository.remoteUrl }] };
    mocks.checkouts = [nestedRepository];
    mocks.clones = [{ projectId: "child", destinationPath: nestedRepository.cwd, phase }];
    await mount();
    expect(prepare().props.disabled).toBe(true);
  },
);
it("waits for the existing checkout check before enabling preparation", async () => {
  mocks.repositories = { "42:list::list": [{ remoteUrl: nestedRepository.remoteUrl }] };
  mocks.checking = true;
  await mount();
  expect(prepare().props.disabled).toBe(true);
});

it("keeps worktree mode when discovery refreshes an existing Git root", async () => {
  mocks.repositories = { "42:list::list": [{ remoteUrl: nestedRepository.remoteUrl }] };
  mocks.checkouts = [{ ...nestedRepository, cwd: "/workspace" }];
  await mount();
  expect(prepare().props.disabled).toBe(false);
  await act(async () => prepare().props.onClick());
  expect(mocks.newThread).toHaveBeenCalledWith(
    { environmentId: "test", projectId: "repo" },
    { envMode: "worktree" },
  );
  expect(mocks.setPrompt.mock.calls[0]?.[1].match(/"cwd":"\/workspace"/g)).toHaveLength(1);
});
