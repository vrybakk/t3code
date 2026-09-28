import { EnvironmentId, type ClickUpSprint } from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import * as Option from "effect/Option";
import { AsyncResult } from "effect/unstable/reactivity";
import { act, createElement } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, expect, it, vi } from "vite-plus/test";
const state = vi.hoisted(() => ({ result: undefined as unknown }));
vi.mock("./useClickUpCachedQuery", () => ({ useClickUpCachedQuery: () => state.result }));
vi.mock("../../state/server", () => ({ serverEnvironment: { clickUpTasks: () => "tasks" } }));
vi.mock("@tanstack/react-router", () => ({ useSearch: () => ({}), useNavigate: () => vi.fn() }));
vi.mock("../ui/button", () => ({ Button: "button" }));
vi.mock("../ui/badge", () => ({ Badge: "span" }));
vi.mock("../ui/scroll-area", () => ({ ScrollArea: "div" }));
vi.mock("../ui/collapsible", () => ({
  Collapsible: "div",
  CollapsibleTrigger: "button",
  CollapsiblePanel: "div",
}));
vi.mock("./ClickUpSprintTable", () => ({
  ClickUpSprintTable: ({ groups }: { groups: Array<{ tasks: Array<{ name: string }> }> }) =>
    createElement(
      "div",
      {},
      groups.flatMap((group) => group.tasks.map((task) => task.name)).join(","),
    ),
}));
import { SprintTasks } from "./ClickUpSprintTasks";
const sprint: ClickUpSprint = {
  id: "sprint",
  name: "Current sprint",
  state: "active",
  startDate: null,
  dueDate: null,
  taskCount: 1,
};
let root: ReactTestRenderer | undefined;
afterEach(async () => {
  await act(() => root?.unmount());
  root = undefined;
  vi.unstubAllGlobals();
});
const text = () => JSON.stringify(root?.toJSON());
async function render(result: unknown) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  state.result = result;
  const node = createElement(SprintTasks, {
    environmentId: EnvironmentId.make("env"),
    workspaceId: "workspace",
    userId: 17,
    sprint,
  });
  await act(() => {
    if (root) root.update(node);
    else root = create(node);
  });
}
it("retains the task table while refreshing and after refresh failure", async () => {
  const saved = AsyncResult.success({
    tasks: [
      {
        workspaceId: "workspace",
        taskId: "task",
        name: "Saved task",
        status: "to do",
        priority: null,
        listName: "Project",
        description: "",
      },
    ],
    hasMore: false,
  });
  await render(AsyncResult.waiting(saved));
  expect(text()).toContain("Saved task");
  expect(text()).toContain("Updating…");
  expect(text()).not.toContain("Loading tasks…");
  await render(
    AsyncResult.failureWithPrevious(Cause.fail(new Error("offline")), {
      previous: Option.some(saved),
    }),
  );
  expect(text()).toContain("Saved task");
  expect(text()).toContain("Showing saved data");
});
it("keeps initial loading, empty results, and initial failure distinct", async () => {
  await render(AsyncResult.initial(true));
  expect(text()).toContain("Loading tasks…");
  await render(AsyncResult.success({ tasks: [], hasMore: false }));
  expect(text()).toContain("No tasks assigned to you");
  await render(AsyncResult.fail(new Error("offline")));
  expect(text()).toContain("Could not load sprint tasks");
  expect(text()).not.toContain("Showing saved data");
});
