import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/shell";
import { EnvironmentId, ProjectId, ThreadId, type ClickUpTask } from "@t3tools/contracts";
import { AsyncResult } from "effect/unstable/reactivity";
import { act, type ReactElement, type ReactNode } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";

const state = vi.hoisted(() => ({
  threads: [] as EnvironmentThreadShell[],
  links: [] as { threadId: ThreadId; projectId: ProjectId; title: string }[],
  query: vi.fn(() => "links"),
  refresh: vi.fn(),
}));
vi.mock("@effect/atom-react", () => ({
  useAtomValue: () => AsyncResult.success(state.links),
}));
vi.mock("../../state/entities", () => ({ useThreadShells: () => state.threads }));
vi.mock("../../state/server", () => ({ serverEnvironment: { clickUpThreads: state.query } }));
vi.mock("../../rpc/atomRegistry", () => ({ appAtomRegistry: { refresh: state.refresh } }));
vi.mock("./useClickUpBackgroundAction", () => ({
  useClickUpBackgroundAction: () => ({ state: undefined, run: vi.fn() }),
}));
vi.mock("./ClickUpBackgroundAction", () => ({ ClickUpBackgroundAction: () => null }));
vi.mock("./ClickUpTaskLauncher", () => ({ ClickUpTaskLauncher: () => null }));
vi.mock("./ClickUpTaskEditors", () => ({ ClickUpStatusIconPicker: () => null }));
vi.mock("@tanstack/react-router", () => ({ Link: "a" }));
vi.mock("../ui/button", async () => {
  const { cloneElement } = await import("react");
  return {
    Button: ({ render, children, ...props }: { render?: ReactElement; children?: ReactNode }) =>
      render ? cloneElement(render, props, children) : <button {...props}>{children}</button>,
  };
});
vi.mock("../ui/tooltip", async () => {
  const { cloneElement } = await import("react");
  return {
    Tooltip: ({ children }: { children: ReactNode }) => children,
    TooltipTrigger: ({ render, children }: { render: ReactElement; children: ReactNode }) =>
      cloneElement(render, {}, children),
    TooltipPopup: () => null,
  };
});

import { ClickUpSprintTable } from "./ClickUpSprintTable";
import { ClickUpTaskActionButtons } from "./ClickUpTaskActions";

const environmentId = EnvironmentId.make("local");
const threadId = ThreadId.make("thread");
const task: ClickUpTask = {
  taskId: "task",
  workspaceId: "workspace",
  name: "Checkout",
  description: "",
  listName: "Sprint",
  status: "in progress",
};
const thread = (overrides: Partial<EnvironmentThreadShell> = {}) =>
  ({
    id: threadId,
    environmentId,
    archivedAt: null,
    session: { status: "running" },
    hasPendingApprovals: false,
    hasPendingUserInput: false,
    ...overrides,
  }) as EnvironmentThreadShell;
const link = (id: ThreadId) => ({ threadId: id, projectId: ProjectId.make("project"), title: id });
const table = (row = task) => (
  <ClickUpSprintTable
    environmentId={environmentId}
    workspaceId={task.workspaceId}
    userId={7}
    sprintId="sprint"
    showAll={false}
    groups={[{ label: null, tasks: [row] }]}
  />
);
let renderer: ReactTestRenderer;
const seeLinks = () =>
  renderer.root.findAllByType("a").filter((item) => item.props["aria-label"]?.startsWith("See"));
const startButtons = () =>
  renderer.root
    .findAllByType("button")
    .filter((item) => item.props["aria-label"]?.startsWith("Start task"));

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.clearAllMocks();
  state.threads = [];
  state.links = [link(threadId)];
});
afterEach(async () => {
  await act(async () => renderer?.unmount());
  vi.unstubAllGlobals();
});

it("replaces Start with a scoped thread link only during active work", async () => {
  await act(async () => {
    renderer = create(table());
  });
  expect(startButtons()).toHaveLength(1);
  expect(state.query).not.toHaveBeenCalled();
  state.threads = [thread()];
  await act(async () => renderer.update(table()));
  expect(startButtons()).toHaveLength(0);
  expect(seeLinks()[0]?.props.params).toEqual({ environmentId, threadId });
  expect(state.query).toHaveBeenCalledWith({
    environmentId,
    input: { workspaceId: "workspace", userId: 7, taskId: "task" },
  });
  state.threads = [thread({ session: null })];
  await act(async () => renderer.update(table()));
  expect(seeLinks()).toHaveLength(0);
  expect(startButtons()).toHaveLength(1);
});

it.each([
  { environmentId: EnvironmentId.make("remote") },
  { archivedAt: "2026-09-28T12:00:00.000Z" },
  { hasPendingApprovals: true },
  { hasPendingUserInput: true },
])("does not replace Start for an unavailable or waiting thread: %j", async (overrides) => {
  state.threads = [thread(overrides)];
  await act(async () => {
    renderer = create(table());
  });
  expect(seeLinks()).toHaveLength(0);
  expect(startButtons()).toHaveLength(1);
});

it("selects the newest running linked thread and permits navigation with no agent", async () => {
  const newer = ThreadId.make("newer");
  const idle = ThreadId.make("idle");
  state.links = [link(idle), link(newer), link(threadId)];
  state.threads = [thread(), thread({ id: newer }), thread({ id: idle, session: null })];
  await act(async () => {
    renderer = create(table({ ...task, tags: ["no agent"] }));
  });
  expect(seeLinks()[0]?.props.params.threadId).toBe(newer);
  expect(seeLinks()[0]?.props["aria-disabled"]).toBeUndefined();
});

it("refreshes cached associations when running identities change, but not on streamed updates", async () => {
  state.threads = [thread()];
  state.links = [];
  await act(async () => {
    renderer = create(table());
  });
  expect(state.refresh).toHaveBeenCalledTimes(1);
  state.threads = [thread({ title: "Updated title" })];
  await act(async () => renderer.update(table()));
  expect(state.refresh).toHaveBeenCalledTimes(1);
  const newer = ThreadId.make("newer");
  state.threads = [thread(), thread({ id: newer })];
  state.links = [link(newer)];
  await act(async () => renderer.update(table()));
  expect(state.refresh).toHaveBeenCalledTimes(2);
  expect(seeLinks()[0]?.props.params.threadId).toBe(newer);
});

it("leaves the task detail implementation action available while its thread runs", async () => {
  state.threads = [thread()];
  await act(async () => {
    renderer = create(
      <ClickUpTaskActionButtons
        environmentId={environmentId}
        input={{ workspaceId: task.workspaceId, userId: 7, taskId: task.taskId }}
        task={task}
        onSelect={vi.fn()}
      />,
    );
  });
  expect(startButtons()).toHaveLength(1);
  expect(seeLinks()).toHaveLength(0);
  expect(state.query).not.toHaveBeenCalled();
});
