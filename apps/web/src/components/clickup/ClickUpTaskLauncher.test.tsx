import {
  DEFAULT_SERVER_SETTINGS,
  EnvironmentId,
  ProjectId,
  type ClickUpTaskDetails,
} from "@t3tools/contracts";
import { act } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
  newThread: vi.fn(),
  repositories: {} as Record<string, { remoteUrl: string }[]>,
  clones: [] as { projectId: string; phase: string }[],
  setPrompt: vi.fn(),
  setInteractionMode: vi.fn(),
  setDraftThreadContext: vi.fn(),
}));
vi.mock("../../composerDraftStore", () => ({ useComposerDraftStore: { getState: () => mocks } }));
vi.mock("../../hooks/useHandleNewThread", () => ({ useNewThreadHandler: () => mocks.newThread }));
vi.mock("../../hooks/useSettings", () => ({
  useEnvironmentSettings: (_: unknown, selector: (settings: unknown) => unknown) =>
    selector({
      ...DEFAULT_SERVER_SETTINGS,
      clickUpProjectMappings: { "42:list::list": ["repo"] },
      clickUpRepositoryMappings: mocks.repositories,
    }),
}));
vi.mock("../../state/entities", () => ({
  useProjects: () => [
    { id: "repo", environmentId: "test", title: "API" },
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
import type { ClickUpTaskAction } from "./taskPrompt";

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
  mocks.repositories = {};
  mocks.clones = [];
  mocks.newThread.mockResolvedValue({ draftId: "draft" });
});
afterEach(async () => {
  await act(async () => renderer?.unmount());
  vi.unstubAllGlobals();
});
async function mount(action: ClickUpTaskAction, taskDetails = details) {
  await act(async () => {
    renderer = create(
      <ClickUpTaskLauncher
        environmentId={EnvironmentId.make("test")}
        details={taskDetails}
        action={action}
      />,
    );
  });
}
function prepare() {
  return renderer.root
    .findAllByType("button")
    .find((button) => button.children.includes("Prepare thread"))!;
}
it.each([
  ["requirements", "default", "Check requirements only"],
  ["estimate", "default", "Estimate this task only"],
  ["implement", "default", "Implement the agreed scope"],
] as const)(
  "prepares a linked %s draft with the correct mode and full context",
  async (action, mode, instruction) => {
    await mount(action);
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
    expect(prompt).toContain(instruction);
    expect(prompt).toContain("Handle empty carts");
    expect(prompt).toContain("PM: Check mobile too");
    if (action === "requirements") {
      expect(prompt).not.toContain("complete_clickup_estimation");
      expect(prompt).not.toContain("Implement the agreed scope");
    }
    if (action === "estimate") expect(prompt).not.toContain("Implement the agreed scope");
  },
);
it("does not write draft context after launch fails", async () => {
  mocks.newThread.mockRejectedValue(new Error("Unavailable"));
  await mount("implement");
  await act(async () => prepare().props.onClick());
  expect(mocks.setPrompt).not.toHaveBeenCalled();
  expect(mocks.setDraftThreadContext).not.toHaveBeenCalled();
  expect(renderer.root.findByProps({ role: "alert" }).children.join("")).toContain(
    "Could not prepare",
  );
});

it("blocks implementation for no agent tasks but permits requirements review", async () => {
  const tagged = { ...details, task: { ...details.task, tags: ["no agent"] } };
  await mount("implement", tagged);
  expect(prepare().props.disabled).toBe(true);
  await act(async () => prepare().props.onClick());
  expect(mocks.newThread).not.toHaveBeenCalled();
  await act(async () => renderer.unmount());
  await mount("requirements", tagged);
  expect(prepare().props.disabled).toBe(false);
});
it("does not prepare an estimation draft once an estimate exists", async () => {
  await mount("estimate", { ...details, task: { ...details.task, timeEstimate: 60000 } });
  expect(prepare().props.disabled).toBe(true);
  await act(async () => prepare().props.onClick());
  expect(mocks.newThread).not.toHaveBeenCalled();
});

it("does not prepare work while a required repository is missing", async () => {
  mocks.repositories = { "42:list::list": [{ remoteUrl: "https://github.com/company/missing" }] };
  await mount("implement");
  expect(prepare().props.disabled).toBe(true);
  await act(async () => prepare().props.onClick());
  expect(mocks.newThread).not.toHaveBeenCalled();
});
it.each(["running", "failed", "cancelled"])(
  "does not prepare work from a %s clone",
  async (phase) => {
    mocks.clones = [{ projectId: "repo", phase }];
    await mount("implement");
    expect(prepare().props.disabled).toBe(true);
    await act(async () => prepare().props.onClick());
    expect(mocks.newThread).not.toHaveBeenCalled();
  },
);
