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
  setPrompt: vi.fn(),
  setInteractionMode: vi.fn(),
  setDraftThreadContext: vi.fn(),
}));
vi.mock("../../composerDraftStore", () => ({ useComposerDraftStore: { getState: () => mocks } }));
vi.mock("../../hooks/useHandleNewThread", () => ({ useNewThreadHandler: () => mocks.newThread }));
vi.mock("../../hooks/useSettings", () => ({
  useEnvironmentSettings: (_: unknown, selector: (settings: unknown) => unknown) =>
    selector({ ...DEFAULT_SERVER_SETTINGS, clickUpProjectMappings: { "42:list::list": ["repo"] } }),
}));
vi.mock("../../state/entities", () => ({
  useProjects: () => [
    { id: "repo", environmentId: "test", title: "API" },
    { id: "other", environmentId: "remote", title: "Other environment" },
  ],
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

it("blocks implementation for no agent tasks", async () => {
  const tagged = { ...details, task: { ...details.task, tags: ["no agent"] } };
  await mount(tagged);
  expect(prepare().props.disabled).toBe(true);
  await act(async () => prepare().props.onClick());
  expect(mocks.newThread).not.toHaveBeenCalled();
});
