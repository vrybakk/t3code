import { EnvironmentId, ThreadId, type ClickUpTaskDetails } from "@t3tools/contracts";
import { afterEach, expect, it } from "vite-plus/test";
import { useComposerDraftStore } from "../../composerDraftStore";
import { prepareLinkedTaskDraft } from "./prepareLinkedTaskDraft";

const thread = {
  environmentId: EnvironmentId.make("test-env"),
  threadId: ThreadId.make("current"),
};
const other = { ...thread, threadId: ThreadId.make("other") };
const details: ClickUpTaskDetails = {
  task: {
    workspaceId: "42",
    taskId: "context-task",
    name: "Fix checkout",
    status: "open",
    listName: "Sprint",
    description: "Private task details",
  },
  commentsMayHaveMore: false,
  comments: [],
  attachments: [],
};
afterEach(() => {
  useComposerDraftStore.getState().clearDraftThread(thread);
  useComposerDraftStore.getState().clearDraftThread(other);
});
it("appends an explicitly targeted start command to this thread without replacing its draft", () => {
  const store = useComposerDraftStore.getState();
  store.setPrompt(thread, "Keep my instructions");
  store.setPrompt(other, "Other thread");
  const prompt = prepareLinkedTaskDraft(thread, details);
  expect(prompt).toBe(
    "Keep my instructions\n\n$studio-task-workflow Start task: Fix checkout\nUse linked task https://app.clickup.com/t/context-task in workspace 42 for all workflow calls.",
  );
  expect(store.getComposerDraft(thread)?.prompt).toBe(prompt);
  expect(store.getComposerDraft(other)?.prompt).toBe("Other thread");
  expect(prompt).not.toContain("Private task details");
  expect(prepareLinkedTaskDraft(thread, details)).toBe(prompt);
});
it("leaves the draft unchanged for a task blocked by no agent", () => {
  useComposerDraftStore.getState().setPrompt(thread, "Keep this");
  expect(
    prepareLinkedTaskDraft(thread, { ...details, task: { ...details.task, tags: [" No Agent "] } }),
  ).toBeNull();
  expect(useComposerDraftStore.getState().getComposerDraft(thread)?.prompt).toBe("Keep this");
});
