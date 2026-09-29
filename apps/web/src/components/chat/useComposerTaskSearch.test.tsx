import { RegistryContext } from "@effect/atom-react";
import {
  EnvironmentId,
  type ClickUpConnection,
  type ClickUpTask,
  type ClickUpTasksInput,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import { Atom, AtomRegistry, AsyncResult } from "effect/unstable/reactivity";
import { act, useLayoutEffect } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";

const api = vi.hoisted(() => ({
  clickUpConnection: vi.fn(),
  clickUpSprints: vi.fn(),
  clickUpTasks: vi.fn(),
}));
vi.mock("../../state/server", () => ({ serverEnvironment: api }));
import { useComposerTaskSearch } from "./useComposerTaskSearch";

const environmentId = EnvironmentId.make("remote");
const task = (taskId: string, name: string): ClickUpTask => ({
  workspaceId: "workspace",
  taskId,
  name,
  status: "to do",
  listName: "Project backlog",
  description: "",
});
const sprintTasks = [
  task("sprint-allow", "Allow invoice opt out"),
  task("sprint-note", "Remove note"),
];
const otherUserTask = task("other-user", "Other person's task");
type TaskPage = { tasks: readonly ClickUpTask[]; hasMore: boolean; nextSearchPage?: number };
type TaskRequest = {
  environmentId: EnvironmentId;
  input: ClickUpTasksInput;
  resolve: (page: TaskPage) => void;
  reject: (error: Error) => void;
};
let requests: TaskRequest[];
const connectionValue = (userId = 17): ClickUpConnection => ({
  configured: true,
  user: { id: userId, username: "Me" },
  workspaces: [
    { id: "workspace", name: "Workspace" },
    { id: "other-workspace", name: "Other workspace" },
  ],
});
let connections: Map<EnvironmentId, Atom.Writable<AsyncResult.AsyncResult<ClickUpConnection>>>;
let registry: ReturnType<typeof AtomRegistry.make>;
let root: ReactTestRenderer | undefined;
let result: ReturnType<typeof useComposerTaskSearch>;

interface Scope {
  environmentId?: EnvironmentId;
  preferredWorkspaceId?: string;
}
function Probe({ query, ...scope }: { query: string | null } & Scope) {
  const value = useComposerTaskSearch(
    scope.environmentId ?? environmentId,
    query,
    true,
    scope.preferredWorkspaceId,
  );
  useLayoutEffect(() => {
    result = value;
  });
  return null;
}
async function render(query: string | null, scope: Scope = {}) {
  await act(() => {
    const node = (
      <RegistryContext.Provider value={registry}>
        <Probe query={query} {...scope} />
      </RegistryContext.Provider>
    );
    if (root) root.update(node);
    else root = create(node);
  });
}
async function debounce() {
  await act(() => vi.advanceTimersByTimeAsync(250));
}
const ids = () => result.tasks.map((entry) => entry.taskId);
const remoteRequests = () => requests.filter((request) => request.input.query !== undefined);
async function loadSprint() {
  await render("");
  const request = requests.find((entry) => entry.input.listId === "sprint");
  expect(request).toBeDefined();
  await act(async () => request!.resolve({ tasks: sprintTasks, hasMore: false }));
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("window", { setTimeout, clearTimeout });
  registry = AtomRegistry.make();
  requests = [];
  api.clickUpConnection.mockReset();
  api.clickUpSprints.mockReset();
  api.clickUpTasks.mockReset();
  connections = new Map();
  const sprints = Atom.make(Effect.succeed({ activeSprintId: "sprint", sprints: [] }));
  const taskAtoms = new Map<string, Atom.Atom<AsyncResult.AsyncResult<TaskPage, unknown>>>();
  api.clickUpConnection.mockImplementation(
    ({ environmentId: requestedEnvironment }: { environmentId: EnvironmentId }) => {
      let atom = connections.get(requestedEnvironment);
      if (!atom) {
        atom = Atom.make<AsyncResult.AsyncResult<ClickUpConnection>>(
          AsyncResult.success(connectionValue()),
        );
        connections.set(requestedEnvironment, atom);
      }
      return atom;
    },
  );
  api.clickUpSprints.mockReturnValue(sprints);
  api.clickUpTasks.mockImplementation(
    ({
      environmentId: requestedEnvironment,
      input,
    }: {
      environmentId: EnvironmentId;
      input: ClickUpTasksInput;
    }) => {
      const key = JSON.stringify([requestedEnvironment, input]);
      let atom = taskAtoms.get(key);
      if (!atom) {
        atom = Atom.make(
          Effect.tryPromise(
            () =>
              new Promise<TaskPage>((resolve, reject) =>
                requests.push({ environmentId: requestedEnvironment, input, resolve, reject }),
              ),
          ),
        );
        taskAtoms.set(key, atom);
      }
      return atom;
    },
  );
});
afterEach(async () => {
  await act(() => root?.unmount());
  root = undefined;
  registry.dispose();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("opens with the current sprint filtered to the connected user's tasks", async () => {
  await render("");
  const request = requests[0]!;
  expect(request.input).toMatchObject({ workspaceId: "workspace", userId: 17, listId: "sprint" });
  await act(async () =>
    request.resolve({
      tasks: request.input.showAll ? [...sprintTasks, otherUserTask] : sprintTasks,
      hasMore: false,
    }),
  );
  expect(ids()).toEqual(["sprint-allow", "sprint-note"]);
  expect(request.input.showAll).not.toBe(true);
  expect(remoteRequests()).toHaveLength(0);
});

it("filters sprint tasks immediately while a debounced remote search runs independently", async () => {
  await loadSprint();
  await render("allow");
  expect(ids()).toEqual(["sprint-allow"]);
  expect(remoteRequests()).toHaveLength(0);
  await debounce();
  expect(remoteRequests()).toHaveLength(1);
  expect(remoteRequests()[0]!.input.query).toBe("allow");
  expect(ids()).toEqual(["sprint-allow"]);
  expect(result.isLoading).toBe(true);
});

it("merges remote matches after sprint matches and removes duplicate task references", async () => {
  await loadSprint();
  await render("allow");
  await debounce();
  await act(async () =>
    remoteRequests()[0]!.resolve({
      tasks: [task("outside-sprint", "Allow refunds"), sprintTasks[0]!],
      hasMore: false,
    }),
  );
  expect(ids()).toEqual(["sprint-allow", "outside-sprint"]);
  expect(result.isLoading).toBe(false);
});

it("drops previous remote matches immediately and ignores an obsolete request's response", async () => {
  await loadSprint();
  await render("allow");
  await debounce();
  const obsolete = remoteRequests()[0]!;
  await render("note");
  expect(ids()).toEqual(["sprint-note"]);
  await act(async () => obsolete.resolve({ tasks: [task("old", "Allow old")], hasMore: false }));
  expect(ids()).toEqual(["sprint-note"]);
  await debounce();
  const current = remoteRequests().find((request) => request.input.query === "note")!;
  await act(async () => current.resolve({ tasks: [task("new", "Note audit")], hasMore: false }));
  expect(ids()).toEqual(["sprint-note", "new"]);
  await render("allow");
  expect(ids()).not.toContain("new");
});

it("retains local sprint matches after remote search fails", async () => {
  await loadSprint();
  await render("allow");
  await debounce();
  await act(async () => remoteRequests()[0]!.reject(new Error("ClickUp unavailable")));
  expect(ids()).toEqual(["sprint-allow"]);
  expect(result.isLoading).toBe(false);
});

it("displays first remote matches while the next ClickUp page is pending", async () => {
  await loadSprint();
  await render("allow");
  await debounce();
  const first = remoteRequests()[0]!;
  expect(first.input).toMatchObject({ query: "allow", searchPage: 0 });
  const earlierMatch = task("earlier-page", "Allow older refunds");
  await act(async () =>
    first.resolve({
      tasks: [earlierMatch],
      hasMore: true,
      nextSearchPage: 1,
    }),
  );
  expect(ids()).toEqual(["sprint-allow", "earlier-page"]);
  expect(result.isLoading).toBe(true);
  const second = remoteRequests()[1]!;
  expect(second.input).toMatchObject({ query: "allow", searchPage: 1 });
  await act(async () =>
    second.resolve({
      tasks: [earlierMatch, task("later-page", "Allow new refunds"), sprintTasks[0]!],
      hasMore: false,
    }),
  );
  expect(ids()).toEqual(["sprint-allow", "earlier-page", "later-page"]);
  expect(result.isLoading).toBe(false);
});

it.each(["environment", "workspace", "account"] as const)(
  "discards old sprint and remote results when the %s changes",
  async (change) => {
    await loadSprint();
    await render("allow");
    await debounce();
    await act(async () =>
      remoteRequests()[0]!.resolve({
        tasks: [task("old-scope-match", "Allow old scope")],
        hasMore: true,
        nextSearchPage: 1,
      }),
    );
    const obsoleteContinuation = remoteRequests()[1]!;
    expect(ids()).toEqual(["sprint-allow", "old-scope-match"]);
    const scope: Scope =
      change === "environment"
        ? { environmentId: EnvironmentId.make("another-environment") }
        : change === "workspace"
          ? { preferredWorkspaceId: "other-workspace" }
          : {};
    if (change === "account") {
      await act(() =>
        registry.set(connections.get(environmentId)!, AsyncResult.success(connectionValue(29))),
      );
    } else {
      await render("allow", scope);
    }
    expect(ids()).toEqual([]);
    const expectedEnvironment = scope.environmentId ?? environmentId;
    const expectedWorkspace = scope.preferredWorkspaceId ?? "workspace";
    const expectedUser = change === "account" ? 29 : 17;
    const currentRequests = requests.filter(
      (request) =>
        request.environmentId === expectedEnvironment &&
        request.input.workspaceId === expectedWorkspace &&
        request.input.userId === expectedUser,
    );
    const currentSprint = currentRequests.find((request) => request.input.listId === "sprint")!;
    const currentSearch = currentRequests.find((request) => request.input.query === "allow")!;
    expect(currentSearch.input.searchPage).toBe(0);
    await act(async () =>
      obsoleteContinuation.resolve({
        tasks: [task("obsolete-continuation", "Allow obsolete scope")],
        hasMore: false,
      }),
    );
    expect(ids()).toEqual([]);
    await act(async () => {
      currentSprint.resolve({
        tasks: [{ ...task("new-sprint", "Allow new sprint"), workspaceId: expectedWorkspace }],
        hasMore: false,
      });
      currentSearch.resolve({
        tasks: [{ ...task("new-remote", "Allow new remote"), workspaceId: expectedWorkspace }],
        hasMore: false,
      });
    });
    expect(ids()).toEqual(["new-sprint", "new-remote"]);
  },
);

it("returns all sprint tasks immediately when the query is cleared", async () => {
  await loadSprint();
  await render("allow");
  await debounce();
  const pending = remoteRequests()[0]!;
  await render("");
  expect(ids()).toEqual(["sprint-allow", "sprint-note"]);
  expect(result.isLoading).toBe(false);
  await act(async () =>
    pending.resolve({ tasks: [task("remote", "Allow refunds")], hasMore: false }),
  );
  await debounce();
  expect(ids()).toEqual(["sprint-allow", "sprint-note"]);
  expect(remoteRequests()).toHaveLength(1);
});

it("matches words without case or surrounding whitespace and treats whitespace as an empty query", async () => {
  await loadSprint();
  await render("  INVOICE allow  ");
  expect(ids()).toEqual(["sprint-allow"]);
  await debounce();
  expect(remoteRequests()[0]!.input.query).toBe("INVOICE allow");
  await render("   ");
  expect(ids()).toEqual(["sprint-allow", "sprint-note"]);
  expect(result.isLoading).toBe(false);
  await debounce();
  expect(remoteRequests()).toHaveLength(1);
});

it("refreshes the same search cursor after a server snapshot reset and stops after completion", async () => {
  await loadSprint();
  await render("allow");
  await debounce();
  await act(async () =>
    remoteRequests()[0]!.resolve({
      tasks: [task("before-reset", "Allow old snapshot")],
      hasMore: true,
      nextSearchPage: 1,
    }),
  );
  expect(remoteRequests()).toHaveLength(2);
  expect(remoteRequests()[1]!.input.searchPage).toBe(1);
  await act(async () =>
    remoteRequests()[1]!.resolve({
      tasks: [task("after-reset", "Allow fresh snapshot")],
      hasMore: true,
      nextSearchPage: 1,
    }),
  );
  expect(remoteRequests()).toHaveLength(3);
  expect(remoteRequests()[2]!.input.searchPage).toBe(1);
  expect(ids()).toEqual(["sprint-allow", "after-reset"]);
  expect(result.isLoading).toBe(true);
  await act(async () =>
    remoteRequests()[2]!.resolve({
      tasks: [task("after-reset", "Allow fresh snapshot"), task("last-page", "Allow final match")],
      hasMore: false,
    }),
  );
  expect(ids()).toEqual(["sprint-allow", "after-reset", "last-page"]);
  expect(result.isLoading).toBe(false);
  await render("allow");
  await debounce();
  expect(remoteRequests()).toHaveLength(3);
});
