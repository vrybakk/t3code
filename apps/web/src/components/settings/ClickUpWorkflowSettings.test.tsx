import {
  DEFAULT_CLICKUP_WORKFLOW_MODELS,
  EnvironmentId,
  ProviderInstanceId,
} from "@t3tools/contracts";
import { AsyncResult } from "effect/unstable/reactivity";
import { act } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";

const state = vi.hoisted(() => ({ update: vi.fn() }));
vi.mock("../../hooks/useSettings", () => ({
  useEnvironmentSettings: () => DEFAULT_CLICKUP_WORKFLOW_MODELS,
}));
vi.mock("../../state/server", () => ({ serverEnvironment: { updateSettings: "update" } }));
vi.mock("../../state/use-atom-command", () => ({ useAtomCommand: () => state.update }));
vi.mock("../clickup/ClickUpWorkflowModels", () => ({ ClickUpWorkflowModelPicker: "input" }));
vi.mock("../ui/button", () => ({ Button: "button" }));
import { ClickUpWorkflowSettings } from "./ClickUpWorkflowSettings";

let renderer: ReactTestRenderer;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  state.update.mockReset();
});
afterEach(async () => {
  await act(async () => renderer?.unmount());
  vi.unstubAllGlobals();
});

it("preserves unsaved model choices and exposes the actual settings failure", async () => {
  state.update.mockResolvedValue(
    AsyncResult.fail(new Error("Server settings write failed at settings.json.")),
  );
  await act(async () => {
    renderer = create(<ClickUpWorkflowSettings environmentId={EnvironmentId.make("test")} />);
  });
  const models = {
    ...DEFAULT_CLICKUP_WORKFLOW_MODELS,
    review: { instanceId: ProviderInstanceId.make("codex"), model: "gpt-6-sol" },
  };
  await act(async () => renderer.root.findByType("input").props.onChange(models));
  const save = () =>
    renderer.root
      .findAllByType("button")
      .find((button) => button.children.includes("Save defaults"))!;
  await act(async () => save().props.onClick());
  expect(renderer.root.findByProps({ role: "alert" }).children.join("")).toContain(
    "Server settings write failed at settings.json.",
  );
  expect(renderer.root.findByType("input").props.value).toEqual(models);
  expect(save().props.disabled).toBe(false);
});
