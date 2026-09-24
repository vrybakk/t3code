import { EnvironmentId, type ClickUpTaskDetails } from "@t3tools/contracts";
import * as Option from "effect/Option";
import { AsyncResult } from "effect/unstable/reactivity";
import { act } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, expect, it, vi } from "vite-plus/test";

const state = vi.hoisted(() => ({
  results: new Map<string, unknown>(),
  commentQueries: vi.fn((cursor?: { id: string }) =>
    cursor ? `comments:${cursor.id}` : "comments",
  ),
  command: vi.fn(async () => ({ _tag: "Success" })),
}));
vi.mock("@effect/atom-react", () => ({
  useAtomValue: (query: unknown) =>
    (typeof query === "string" ? state.results.get(query) : undefined) ?? AsyncResult.initial(),
}));
vi.mock("../../state/server", () => ({
  serverEnvironment: {
    clickUpConnection: () => "connection",
    clickUpTask: () => "task",
    clickUpThreads: () => "links",
    clickUpComments: ({ input }: { input: { cursor?: { id: string } } }) =>
      state.commentQueries(input.cursor),
    clickUpCommentReplies: () => "replies",
  },
}));
vi.mock("../../rpc/atomRegistry", () => ({ appAtomRegistry: { refresh: vi.fn() } }));
vi.mock("../../state/use-atom-command", () => ({ useAtomCommand: () => state.command }));
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
import { appAtomRegistry } from "../../rpc/atomRegistry";
import { ClickUpTaskActivity } from "./ClickUpTaskActivity";

const input = { workspaceId: "42", taskId: "task", userId: 17 };
const initialComment = {
  id: "parent",
  author: "Developer",
  text: "Question",
  createdAt: "123456789",
  assignee: { id: 17, username: "Developer" },
};
const details: ClickUpTaskDetails = {
  task: { ...input, name: "Task", status: "To do", listName: "Sprint", description: "" },
  comments: [initialComment],
  commentsMayHaveMore: false,
  attachments: [],
};

let renderer: ReactTestRenderer;
afterEach(async () => {
  await act(async () => renderer?.unmount());
  vi.unstubAllGlobals();
  state.results.clear();
  vi.clearAllMocks();
});

it("highlights the connected user's mentions in both comments and expanded replies", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  state.results.set(
    "connection",
    AsyncResult.success({ user: { id: 17, username: "Vladyslav Rybak" } }),
  );
  state.results.set(
    "replies",
    AsyncResult.success({
      comments: [{ id: "reply", author: "PM", text: "Thanks @Vladyslav Rybak!" }],
    }),
  );
  await act(async () => {
    renderer = create(
      <ClickUpTaskActivity
        environmentId={EnvironmentId.make("test")}
        input={input}
        details={{
          ...details,
          comments: [
            { ...initialComment, text: "@Vladyslav Rybak please check with @Other User." },
          ],
        }}
      />,
    );
  });
  expect(renderer.root.findAllByType("mark").map((mark) => mark.children.join(""))).toEqual([
    "@Vladyslav Rybak",
  ]);
  await act(async () => {
    renderer.root.findByProps({ "aria-expanded": false }).props.onClick();
  });
  expect(renderer.root.findAllByType("mark").map((mark) => mark.children.join(""))).toEqual([
    "@Vladyslav Rybak",
    "@Vladyslav Rybak",
  ]);
  state.results.set(
    "connection",
    AsyncResult.success({ user: { id: 18, username: "Vladyslav Rybak" } }),
  );
  await act(async () => {
    renderer.update(
      <ClickUpTaskActivity
        environmentId={EnvironmentId.make("test")}
        input={input}
        details={details}
      />,
    );
  });
  expect(renderer.root.findAllByType("mark")).toHaveLength(0);
});

it("uses the detail comment page until pagination and preserves the first-page cursor", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  state.results.set(
    "comments:parent",
    AsyncResult.success({
      comments: [{ id: "older", author: "Developer", text: "Older question" }],
      hasMore: false,
      nextCursor: null,
    }),
  );
  state.results.set(
    "comments",
    AsyncResult.success({
      comments: [initialComment],
      hasMore: false,
      nextCursor: null,
    }),
  );
  await act(async () => {
    renderer = create(
      <ClickUpTaskActivity
        environmentId={EnvironmentId.make("test")}
        input={input}
        details={{ ...details, commentsMayHaveMore: true }}
      />,
    );
  });
  expect(state.commentQueries).not.toHaveBeenCalled();
  expect(JSON.stringify(renderer.toJSON())).toContain("Question");
  await act(async () => {
    renderer.root
      .findAllByType("button")
      .find((button) => button.props.children === "Older")!
      .props.onClick();
  });
  expect(state.commentQueries).toHaveBeenLastCalledWith({ id: "parent", date: "123456789" });
  expect(JSON.stringify(renderer.toJSON())).toContain("Older question");
  await act(async () => {
    renderer.root
      .findAllByType("button")
      .find((button) => button.props.children === "Newer")!
      .props.onClick();
  });
  expect(state.commentQueries).toHaveBeenLastCalledWith(undefined);
  expect(JSON.stringify(renderer.toJSON())).not.toContain("Older question");
});

it.each(["post", "reply", "resolve"] as const)(
  "loads fresh first-page comments after %s without fetching on mount",
  async (action) => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    state.results.set(
      "comments",
      AsyncResult.success({
        comments: [{ ...initialComment, text: "Updated conversation", resolved: true }],
        hasMore: false,
        nextCursor: null,
      }),
    );
    state.results.set("replies", AsyncResult.success({ comments: [] }));
    await act(async () => {
      renderer = create(
        <ClickUpTaskActivity
          environmentId={EnvironmentId.make("test")}
          input={input}
          details={details}
        />,
      );
    });
    expect(state.commentQueries).not.toHaveBeenCalled();
    if (action === "resolve") {
      await act(async () => {
        renderer.root
          .findAllByType("button")
          .find((button) => button.props.children === "Resolve")!
          .props.onClick();
      });
    } else {
      if (action === "reply") {
        await act(async () => {
          renderer.root
            .findAllByType("button")
            .find((button) => button.props["aria-expanded"] === false)!
            .props.onClick();
        });
      }
      const label = action === "reply" ? "Write a reply" : "Write a comment";
      await act(async () => {
        renderer.root
          .findByProps({ "aria-label": label })
          .props.onChange({ target: { value: "New message" } });
      });
      await act(async () => {
        const textarea = renderer.root.findByProps({ "aria-label": label });
        textarea.parent!.props.onSubmit({ preventDefault: () => {} });
      });
    }
    expect(state.command).toHaveBeenCalledOnce();
    expect(state.commentQueries).toHaveBeenLastCalledWith(undefined);
    expect(JSON.stringify(renderer.toJSON())).toContain("Updated conversation");
    await act(async () => {
      renderer.root.findByProps({ "aria-label": "Refresh comments" }).props.onClick();
    });
    expect(appAtomRegistry.refresh).toHaveBeenCalledWith("comments");
  },
);

it("keeps comment and reply drafts through failed refreshes and successful retries", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const input = { workspaceId: "42", taskId: "task", userId: 17 };
  const details: ClickUpTaskDetails = {
    task: { ...input, name: "Task", status: "To do", listName: "Sprint", description: "" },
    comments: [{ id: "parent", author: "Developer", text: "Question" }],
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
  expect(state.commentQueries).not.toHaveBeenCalled();
  await act(async () => {
    renderer.root.findByProps({ "aria-label": "Refresh comments" }).props.onClick();
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
