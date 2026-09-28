import { EnvironmentId } from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import { AsyncResult } from "effect/unstable/reactivity";
import { act, StrictMode } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({ analyze: vi.fn(), launch: vi.fn(), toast: vi.fn() }));
vi.mock("@effect/atom-react", () => ({ useAtomValue: () => ({ _tag: "Initial" }) }));
vi.mock("../../state/server", () => ({
  serverEnvironment: { clickUpTask: vi.fn(), clickUpAnalyzeTask: {} },
}));
vi.mock("../../rpc/atomRegistry", () => ({ appAtomRegistry: { refresh: vi.fn() } }));
vi.mock("../../state/use-atom-command", () => ({ useAtomCommand: () => mocks.analyze }));
vi.mock("./ClickUpTaskLauncher", () => ({ ClickUpTaskLauncher: mocks.launch }));
vi.mock("../ui/toast", () => ({ toastManager: { add: mocks.toast } }));
vi.mock("../ui/dialog", () => ({
  Dialog: "dialog",
  DialogPopup: "div",
  DialogHeader: "header",
  DialogTitle: "h2",
  DialogDescription: "p",
  DialogPanel: "section",
  DialogFooter: "footer",
}));
vi.mock("../ui/spinner", () => ({ Spinner: "svg" }));
vi.mock("../ui/button", () => ({ Button: "button" }));
vi.mock("../ui/tooltip", () => ({ Tooltip: "div", TooltipPopup: "div", TooltipTrigger: "div" }));
import { subscribeTaskAnalysisNotifications } from "./taskAnalysisFeedback";
import { ClickUpTaskActionDialog } from "./ClickUpTaskActions";

let renderer: ReactTestRenderer;
let taskNumber = 0;
let unsubscribe: () => void;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.clearAllMocks();
  unsubscribe = subscribeTaskAnalysisNotifications(mocks.toast);
  input.taskId = `task-${++taskNumber}`;
});
afterEach(async () => {
  await act(async () => renderer?.unmount());
  unsubscribe();
  vi.unstubAllGlobals();
});
const input = { workspaceId: "42", taskId: "task", userId: 7 };
const success = {
  summary: "Supplied requirements are clear.",
  estimateMinutes: null,
  findings: null,
  estimateSaved: false,
  tagRemoved: false,
  findingsPosted: false,
};
function dialog(action: "estimate" | "requirements") {
  return (
    <StrictMode>
      <ClickUpTaskActionDialog
        environmentId={EnvironmentId.make("test")}
        input={input}
        action={action}
        taskName="Checkout"
        onClose={vi.fn()}
      />
    </StrictMode>
  );
}
it.each(["estimate", "requirements"] as const)(
  "runs %s once without a launcher and displays the result",
  async (action) => {
    let finish!: (value: ReturnType<typeof AsyncResult.success<typeof success>>) => void;
    mocks.analyze.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    await act(async () => {
      renderer = create(dialog(action));
    });
    expect(renderer.root.findByProps({ role: "status" }).children.join("")).toContain(
      "continues after closing",
    );
    expect(mocks.analyze).toHaveBeenCalledTimes(1);
    expect(mocks.analyze).toHaveBeenCalledWith({
      environmentId: "test",
      input: { ...input, action },
    });
    expect(mocks.launch).not.toHaveBeenCalled();
    await act(async () => {
      finish(AsyncResult.success(success));
    });
    expect(renderer.root.findByProps({ role: "status" }).findAllByType("p")[0]?.children).toContain(
      success.summary,
    );
  },
);
it("announces completion after closing the dialog", async () => {
  let finish!: (value: ReturnType<typeof AsyncResult.success<typeof success>>) => void;
  mocks.analyze.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  await act(async () => {
    renderer = create(dialog("requirements"));
  });
  await act(async () => renderer.unmount());
  await act(async () => {
    finish(AsyncResult.success(success));
  });
  expect(mocks.toast).toHaveBeenCalledWith(
    expect.objectContaining({ state: { result: success, error: null } }),
  );
});
it("surfaces the actual background error without opening a thread", async () => {
  mocks.analyze.mockResolvedValue(
    AsyncResult.failure(Cause.fail(new Error("Provider is unavailable"))),
  );
  await act(async () => {
    renderer = create(dialog("estimate"));
  });
  expect(renderer.root.findByType("pre").children).toContain("Provider is unavailable");
  expect(renderer.root.findByProps({ role: "alert" }).children.join("")).toContain(
    "Could not confirm",
  );
  expect(mocks.launch).not.toHaveBeenCalled();
});

it("reuses the running action and saved result after closing and reopening", async () => {
  let finish!: (value: ReturnType<typeof AsyncResult.success<typeof success>>) => void;
  mocks.analyze.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  await act(async () => {
    renderer = create(dialog("requirements"));
  });
  await act(async () => renderer.unmount());
  await act(async () => {
    renderer = create(dialog("requirements"));
  });
  expect(mocks.analyze).toHaveBeenCalledTimes(1);
  await act(async () => {
    finish(AsyncResult.success(success));
  });
  expect(mocks.toast).toHaveBeenCalledTimes(1);
  await act(async () => renderer.unmount());
  await act(async () => {
    renderer = create(dialog("requirements"));
  });
  expect(mocks.analyze).toHaveBeenCalledTimes(1);
  expect(renderer.root.findByProps({ role: "status" }).findAllByType("p")[0]?.children).toContain(
    success.summary,
  );
  mocks.analyze.mockResolvedValue(AsyncResult.success(success));
  await act(async () =>
    renderer.root
      .findAllByType("button")
      .find((button) => button.children.includes("Run again"))!
      .props.onClick(),
  );
  expect(mocks.analyze).toHaveBeenCalledTimes(2);
});
