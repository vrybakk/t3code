import { EnvironmentId, ThreadId, type ClickUpHandoff } from "@t3tools/contracts";
import { AsyncResult } from "effect/unstable/reactivity";
import { act } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";

const state = vi.hoisted(() => ({
  result: undefined as unknown,
  submit: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("@effect/atom-react", () => ({ useAtomValue: () => state.result }));
vi.mock("../../state/server", () => ({
  serverEnvironment: {
    clickUpWorkflow: () => "workflow",
    clickUpSubmitWorkflow: "submit",
    clickUpTask: () => "task",
  },
}));
vi.mock("../../state/use-atom-command", () => ({ useAtomCommand: () => state.submit }));
vi.mock("../../state/entities", () => ({
  useServerConfigs: () =>
    new Map([
      [
        environmentId,
        {
          environment: {
            capabilities: { clickUpMergedHandoffs: true, clickUpCommentReconciliation: true },
          },
        },
      ],
    ]),
}));
vi.mock("../../rpc/atomRegistry", () => ({ appAtomRegistry: { refresh: state.refresh } }));
vi.mock("@tanstack/react-router", () => ({ Link: "a" }));
vi.mock("../ui/button", () => ({ Button: "button" }));
vi.mock("../ui/badge", () => ({ Badge: "span" }));
vi.mock("../ui/checkbox", () => ({ Checkbox: "input" }));
vi.mock("./ClickUpTimeSync", () => ({
  ClickUpTimeSync: () => <button>Sync ClickUp time</button>,
}));
import { ClickUpTaskHandoffs } from "./ClickUpTaskHandoffs";

const handoff: ClickUpHandoff = {
  id: "handoff",
  threadId: ThreadId.make("thread"),
  summary: "Checkout handles empty carts.",
  createdAt: "2026-09-24T00:00:00Z",
  status: "pending",
  error: null,
  evidence: [
    { kind: "verification", outcome: "passed", details: "Checkout tested." },
    { kind: "independent-review", outcome: "passed", details: "No remaining findings." },
  ],
  pullRequests: [],
  statusUpdated: false,
  commentPosted: false,
};
const environmentId = EnvironmentId.make("test");
const input = { workspaceId: "42", taskId: "task", userId: 17 };
let renderer: ReactTestRenderer;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  state.result = AsyncResult.success({ handoffs: [handoff], submittedThreadIds: [] });
  state.submit
    .mockReset()
    .mockResolvedValue({ _tag: "Success", value: { ...handoff, status: "submitted" } });
  state.refresh.mockReset();
});
afterEach(async () => {
  await act(async () => renderer?.unmount());
  vi.unstubAllGlobals();
});
async function mount() {
  await act(async () => {
    renderer = create(<ClickUpTaskHandoffs environmentId={environmentId} input={input} />);
  });
}
function submitButton() {
  return renderer.root
    .findAllByType("button")
    .find((button) => button.children.includes("Submit handoff"))!;
}
it("requires the developer checkpoint and sends only the selected handoff", async () => {
  await mount();
  expect(submitButton().props.disabled).toBe(true);
  await act(async () => submitButton().props.onClick());
  expect(state.submit).not.toHaveBeenCalled();
  await act(async () => renderer.root.findByType("input").props.onCheckedChange(true));
  await act(async () => submitButton().props.onClick());
  expect(state.submit).toHaveBeenCalledWith({
    environmentId,
    input: { ...input, handoffId: "handoff" },
  });
  expect(state.refresh).toHaveBeenCalledWith("workflow");
  expect(submitButton().props.disabled).toBe(true);
});
it("does not repeat a submission whose result is unknown", async () => {
  state.submit.mockRejectedValue(new Error("Network lost"));
  await mount();
  await act(async () => renderer.root.findByType("input").props.onCheckedChange(true));
  await act(async () => submitButton().props.onClick());
  expect(submitButton().props.disabled).toBe(true);
  await act(async () => submitButton().props.onClick());
  expect(state.submit).toHaveBeenCalledTimes(1);
  expect(renderer.root.findByProps({ role: "alert" }).children.join("")).toContain(
    "could not be confirmed",
  );
});
it.each(["uncertain", "submitting", "submitted"] as const)(
  "does not offer Submit for %s handoffs",
  async (status) => {
    state.result = AsyncResult.success({
      handoffs: [{ ...handoff, status }],
      submittedThreadIds: [],
    });
    await mount();
    expect(submitButton()).toBeUndefined();
    expect(state.submit).not.toHaveBeenCalled();
  },
);

it("requires a manual check before reconciling uncertain comment delivery", async () => {
  state.result = AsyncResult.success({
    handoffs: [{ ...handoff, status: "uncertain" }],
    submittedThreadIds: [],
  });
  await mount();
  const posted = renderer.root
    .findAllByType("button")
    .find((button) => button.children.includes("Summary is posted"))!;
  expect(posted.props.disabled).toBe(true);
  await act(async () => renderer.root.findByType("input").props.onCheckedChange(true));
  await act(async () => posted.props.onClick());
  expect(state.submit).toHaveBeenCalledWith({
    environmentId,
    input: { ...input, handoffId: handoff.id, commentDelivery: "posted" },
  });
});

it("offers approved merge reconciliation only for scope-verifiable submitted handoffs", async () => {
  state.result = AsyncResult.success({
    handoffs: [{ ...handoff, status: "submitted", taskScopeFingerprint: "reviewed-scope" }],
    submittedThreadIds: [handoff.threadId],
  });
  await mount();
  const reconcile = renderer.root
    .findAllByType("button")
    .find((button) => button.children.includes("Check merge and send to QA"))!;
  expect(reconcile.props.disabled).toBe(true);
  await act(async () => renderer.root.findByType("input").props.onCheckedChange(true));
  await act(async () => reconcile.props.onClick());
  expect(state.submit).toHaveBeenCalledWith({
    environmentId,
    input: { ...input, handoffId: handoff.id },
  });
});

it("keeps time sync available when the current handoff is pending", async () => {
  state.result = AsyncResult.success({
    handoffs: [handoff],
    submittedThreadIds: [handoff.threadId],
  });
  await mount();
  expect(
    renderer.root
      .findAllByType("button")
      .some((button) => button.children.includes("Sync ClickUp time")),
  ).toBe(true);
});

it.each(["pending", "partial"] as const)(
  "requires fresh confirmation when an approved %s handoff becomes uncertain",
  async (status) => {
    state.result = AsyncResult.success({
      handoffs: [{ ...handoff, status }],
      submittedThreadIds: [],
    });
    await mount();
    await act(async () => renderer.root.findByType("input").props.onCheckedChange(true));
    expect(renderer.root.findByType("input").props.checked).toBe(true);

    state.result = AsyncResult.success({
      handoffs: [{ ...handoff, status: "uncertain" }],
      submittedThreadIds: [],
    });
    await act(async () => {
      renderer.update(
        <ClickUpTaskHandoffs
          environmentId={environmentId}
          input={input}
          refreshKey="2026-09-29T12:00:00Z"
        />,
      );
    });
    const posted = renderer.root
      .findAllByType("button")
      .find((button) => button.children.includes("Summary is posted"))!;
    const missing = renderer.root
      .findAllByType("button")
      .find((button) => button.children.includes("Summary is missing"))!;
    expect(posted.props.disabled).toBe(true);
    expect(missing.props.disabled).toBe(true);
    await act(async () => posted.props.onClick());
    await act(async () => missing.props.onClick());
    expect(state.submit).not.toHaveBeenCalled();

    await act(async () => renderer.root.findByType("input").props.onCheckedChange(true));
    await act(async () => posted.props.onClick());
    expect(state.submit).toHaveBeenCalledWith({
      environmentId,
      input: { ...input, handoffId: handoff.id, commentDelivery: "posted" },
    });
  },
);
