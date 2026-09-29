import { EnvironmentId, ThreadId, type ClickUpHandoff } from "@t3tools/contracts";
import { AsyncResult } from "effect/unstable/reactivity";
import { act, type ReactNode } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, expect, it, vi } from "vite-plus/test";

const state = vi.hoisted(() => ({
  completedAt: null as string | null,
  summary: "Context task is ready.",
  submit: vi.fn().mockResolvedValue({ _tag: "Success" }),
  refresh: vi.fn(),
}));
const threadRef = {
  environmentId: EnvironmentId.make("test"),
  threadId: ThreadId.make("thread"),
};
const links = [
  { workspaceId: "42", taskId: "primary", name: "Primary task", primary: true },
  { workspaceId: "42", taskId: "context", name: "Context task", primary: false },
];
const handoff: ClickUpHandoff = {
  id: "context-handoff",
  threadId: threadRef.threadId,
  summary: state.summary,
  createdAt: "2026-09-29T00:00:00Z",
  status: "pending",
  error: null,
  evidence: [],
  pullRequests: [],
  statusUpdated: false,
  commentPosted: false,
};
vi.mock("../../state/entities", () => ({
  useThreadShell: () => ({ clickUpTasks: links, latestTurn: { completedAt: state.completedAt } }),
  useServerConfigs: () => new Map(),
}));
vi.mock("../../state/query", () => ({
  useEnvironmentQuery: () => ({
    data: { user: { id: 17 }, workspaces: [{ id: "42" }] },
  }),
}));
vi.mock("../../state/server", () => ({
  serverEnvironment: {
    clickUpConnection: () => "connection",
    clickUpWorkflow: ({ input }: { input: { taskId: string } }) => input.taskId,
    clickUpSubmitWorkflow: "submit",
    clickUpTask: () => "task",
  },
}));
vi.mock("../../state/threads", () => ({ threadEnvironment: { unlinkTask: "unlink" } }));
vi.mock("@effect/atom-react", () => ({
  useAtomValue: (query: string) =>
    AsyncResult.success({
      handoffs: query === "context" ? [{ ...handoff, summary: state.summary }] : [],
    }),
}));
vi.mock("../../state/use-atom-command", () => ({ useAtomCommand: () => state.submit }));
vi.mock("../../rpc/atomRegistry", () => ({ appAtomRegistry: { refresh: state.refresh } }));
vi.mock("../../rightPanelStore", () => ({ useRightPanelStore: {} }));
vi.mock("@tanstack/react-router", () => ({ Link: "a" }));
vi.mock("../ui/button", () => ({ Button: "button" }));
vi.mock("../ui/badge", () => ({ Badge: "span" }));
vi.mock("../ui/checkbox", () => ({ Checkbox: "input" }));
vi.mock("../ui/scroll-area", () => ({ ScrollArea: "div" }));
vi.mock("../ui/select", () => ({
  Select: ({
    onValueChange,
    children,
  }: {
    onValueChange: (value: string) => void;
    children: ReactNode;
  }) => <select onChange={(event) => onValueChange(event.target.value)}>{children}</select>,
  SelectItem: "option",
  SelectPopup: "optgroup",
  SelectTrigger: "span",
  SelectValue: "span",
}));
vi.mock("./LinkThreadTask", () => ({ LinkThreadTask: () => null }));
vi.mock("./ClickUpTimeSync", () => ({ ClickUpTimeSync: () => null }));
import { ThreadTasksPanel } from "./ThreadTasksPanel";

let renderer: ReactTestRenderer;
afterEach(async () => {
  await act(async () => renderer?.unmount());
  vi.unstubAllGlobals();
});

it("refreshes the selected context handoff on turn completion without losing its approval", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  await act(async () => {
    renderer = create(<ThreadTasksPanel threadRef={threadRef} />);
  });
  await act(async () => {
    renderer.root.findByType("select").props.onChange({ target: { value: "42:context" } });
  });
  await act(async () => renderer.root.findByType("input").props.onCheckedChange(true));
  state.refresh.mockClear();
  state.completedAt = "2026-09-29T12:00:00Z";
  state.summary = "Context task verification updated.";
  await act(async () => renderer.update(<ThreadTasksPanel threadRef={threadRef} />));

  expect(state.refresh).toHaveBeenCalledExactlyOnceWith("context");
  expect(renderer.root.findAllByType("p").some((p) => p.children.includes(state.summary))).toBe(
    true,
  );
  const submit = renderer.root
    .findAllByType("button")
    .find((button) => button.children.includes("Submit handoff"))!;
  expect(submit.props.disabled).toBe(false);
  await act(async () => submit.props.onClick());
  expect(state.submit).toHaveBeenCalledWith({
    environmentId: threadRef.environmentId,
    input: { workspaceId: "42", taskId: "context", userId: 17, handoffId: "context-handoff" },
  });
});
