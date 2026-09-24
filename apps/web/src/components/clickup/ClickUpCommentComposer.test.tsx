import { EnvironmentId } from "@t3tools/contracts";
import { act } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";

const commands = vi.hoisted(() => ({ comment: vi.fn(), reply: vi.fn() }));
vi.mock("../../state/server", () => ({
  serverEnvironment: { clickUpCreateComment: "comment", clickUpCreateReply: "reply" },
}));
vi.mock("../../state/use-atom-command", () => ({
  useAtomCommand: (command: "comment" | "reply") => commands[command],
}));
vi.mock("../ui/button", () => ({ Button: "button" }));
vi.mock("../ui/textarea", () => ({ Textarea: "textarea" }));
import { ClickUpCommentComposer } from "./ClickUpCommentComposer";

const environmentId = EnvironmentId.make("test");
const input = { workspaceId: "42", taskId: "task", userId: 17 };
const onSent = vi.fn();
let renderer: ReactTestRenderer;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  commands.comment.mockReset().mockResolvedValue({ _tag: "Success" });
  commands.reply.mockReset().mockResolvedValue({ _tag: "Success" });
  onSent.mockReset();
});
afterEach(async () => {
  await act(async () => renderer?.unmount());
  vi.unstubAllGlobals();
});
async function mount(reply = false) {
  await act(async () => {
    renderer = create(
      <ClickUpCommentComposer
        environmentId={environmentId}
        input={input}
        onSent={onSent}
        {...(reply
          ? {
              replyTo: {
                ...input,
                commentId: "parent",
                cursor: { id: "cursor", date: "1700000000000" },
              },
            }
          : {})}
      />,
    );
  });
}
async function type(text: string) {
  await act(async () =>
    renderer.root.findByType("textarea").props.onChange({ target: { value: text } }),
  );
}
async function submit() {
  await act(async () =>
    renderer.root.findByType("form").props.onSubmit({ preventDefault: vi.fn() }),
  );
}
it("keeps a failed draft and reports that sending was not confirmed", async () => {
  commands.comment.mockResolvedValue({ _tag: "Failure" });
  await mount();
  await type("Keep my draft");
  await submit();
  expect(renderer.root.findByType("textarea").props.value).toBe("Keep my draft");
  expect(renderer.root.findByProps({ role: "alert" }).children.join("")).toContain(
    "could not be confirmed",
  );
  expect(onSent).not.toHaveBeenCalled();
});
it("clears a confirmed comment and asks its owner to refresh", async () => {
  await mount();
  await type("First\n  code\nLast");
  await submit();
  expect(commands.comment).toHaveBeenCalledWith({
    environmentId,
    input: { ...input, text: "First\n  code\nLast" },
  });
  expect(renderer.root.findByType("textarea").props.value).toBe("");
  expect(onSent).toHaveBeenCalledTimes(1);
});
it("posts replies to their parent and preserves the older-page cursor", async () => {
  await mount(true);
  await type("Answer");
  await submit();
  expect(commands.reply).toHaveBeenCalledWith({
    environmentId,
    input: {
      ...input,
      commentId: "parent",
      cursor: { id: "cursor", date: "1700000000000" },
      text: "Answer",
    },
  });
  expect(commands.comment).not.toHaveBeenCalled();
});
it("rejects blank submissions and blocks duplicate sends while one is pending", async () => {
  await mount();
  await type(" \n ");
  await submit();
  expect(commands.comment).not.toHaveBeenCalled();
  let finish!: (value: { _tag: "Success" }) => void;
  const pending = new Promise<{ _tag: "Success" }>((resolve) => {
    finish = resolve;
  });
  commands.comment.mockReturnValue(pending);
  await type("Send once");
  await submit();
  await submit();
  expect(commands.comment).toHaveBeenCalledTimes(1);
  expect(renderer.root.findByType("textarea").props.value).toBe("Send once");
  await act(async () => finish({ _tag: "Success" }));
  expect(renderer.root.findByType("textarea").props.value).toBe("");
});
