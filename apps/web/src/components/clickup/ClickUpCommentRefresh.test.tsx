import { EnvironmentId, type ClickUpTaskDetails } from "@t3tools/contracts";
import * as Option from "effect/Option";
import { AsyncResult } from "effect/unstable/reactivity";
import { act } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, expect, it, vi } from "vite-plus/test";

const state = vi.hoisted(() => ({ results: new Map<string, unknown>() }));
vi.mock("@effect/atom-react", () => ({
  useAtomValue: (query: string) => state.results.get(query),
}));
vi.mock("../../state/server", () => ({
  serverEnvironment: {
    clickUpTask: () => "task",
    clickUpThreads: () => "links",
    clickUpComments: () => "comments",
    clickUpCommentReplies: () => "replies",
  },
}));
vi.mock("../../rpc/atomRegistry", () => ({ appAtomRegistry: { refresh: vi.fn() } }));
vi.mock("../../state/use-atom-command", () => ({ useAtomCommand: () => vi.fn() }));
vi.mock("../ui/button", () => ({ Button: "button" }));
vi.mock("../ui/textarea", () => ({ Textarea: "textarea" }));
vi.mock("../ui/scroll-area", () => ({ ScrollArea: "div" }));
vi.mock("../ChatMarkdown", () => ({ default: () => null }));
vi.mock("./ClickUpTaskFields", () => ({
  ClickUpTaskFields: () => null,
  ClickUpCustomFields: () => null,
}));
vi.mock("./ClickUpTaskWork", () => ({ ClickUpTaskWork: () => null }));
vi.mock("./ClickUpAttachments", () => ({ ClickUpAttachments: () => null }));
vi.mock("./ClickUpTaskChecklist", () => ({ ClickUpTaskChecklist: () => null }));
vi.mock("./ClickUpTaskActions", () => ({
  ClickUpTaskActionButtons: () => null,
  ClickUpTaskActionDialog: () => null,
}));
import { ClickUpTaskPanel } from "./ClickUpTaskPanel";

let renderer: ReactTestRenderer;
afterEach(async () => {
  await act(async () => renderer?.unmount());
  vi.unstubAllGlobals();
  state.results.clear();
});

it("keeps comment and reply drafts through failed refreshes and successful retries", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const input = { workspaceId: "42", taskId: "task", userId: 17 };
  const details: ClickUpTaskDetails = {
    task: { ...input, name: "Task", status: "To do", listName: "Sprint", description: "" },
    comments: [],
    commentsMayHaveMore: false,
    attachments: [],
  };
  const task = AsyncResult.success(details);
  const comments = AsyncResult.success({
    comments: [{ id: "parent", author: "Developer", text: "Question" }],
    hasMore: false,
  });
  state.results.set("task", task);
  state.results.set("comments", comments);
  state.results.set("replies", AsyncResult.success({ comments: [] }));
  const panel = () => <ClickUpTaskPanel environmentId={EnvironmentId.make("test")} input={input} />;
  await act(async () => {
    renderer = create(panel());
  });
  await act(async () => {
    renderer.root
      .findAllByType("button")
      .find((button) => button.props["aria-expanded"] === false)!
      .props.onClick();
  });
  for (const label of ["Write a comment", "Write a reply"]) {
    await act(async () => {
      renderer.root.findByProps({ "aria-label": label }).props.onChange({
        target: { value: `${label} draft` },
      });
    });
  }
  for (const [query, success] of [
    ["comments", comments],
    ["task", task],
  ] as const) {
    state.results.set(
      query,
      AsyncResult.fail<string, unknown>("Offline", { previousSuccess: Option.some(success) }),
    );
    await act(async () => renderer.update(panel()));
    expect(renderer.root.findAllByProps({ role: "alert" }).length).toBeGreaterThan(0);
    for (const label of ["Write a comment", "Write a reply"]) {
      expect(renderer.root.findByProps({ "aria-label": label }).props.value).toBe(`${label} draft`);
    }
    state.results.set(query, success);
    await act(async () => renderer.update(panel()));
    for (const label of ["Write a comment", "Write a reply"]) {
      expect(renderer.root.findByProps({ "aria-label": label }).props.value).toBe(`${label} draft`);
    }
  }
});
