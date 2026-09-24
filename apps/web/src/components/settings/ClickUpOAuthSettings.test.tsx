import { AuthAccessWriteScope, EnvironmentId } from "@t3tools/contracts";
import { AsyncResult } from "effect/unstable/reactivity";
import { act } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";

const state = vi.hoisted(() => ({
  save: vi.fn(),
  clear: vi.fn(),
  refresh: vi.fn(),
  configQuery: vi.fn(),
  config: { clientId: "", redirectUri: "", hasClientSecret: false, source: "none" },
  scopes: [] as string[],
}));
vi.mock("@effect/atom-react", () => ({ useAtomValue: () => AsyncResult.success(state.config) }));
vi.mock("../../env", () => ({ isElectron: false }));
vi.mock("../../environments/primary", () => ({
  usePrimarySessionState: () => ({ data: { authenticated: true, scopes: state.scopes } }),
}));
vi.mock("../../state/session", () => ({
  useEnvironmentSessionState: () => ({ data: { authenticated: true, scopes: state.scopes } }),
}));
vi.mock("../../rpc/atomRegistry", () => ({ appAtomRegistry: { refresh: state.refresh } }));
vi.mock("../../state/server", () => ({
  serverEnvironment: {
    clickUpOAuthConfig: state.configQuery,
    clickUpConnection: () => "connection",
    clickUpSaveOAuthConfig: "save",
    clickUpClearOAuthConfig: "clear",
  },
}));
vi.mock("../../state/use-atom-command", () => ({
  useAtomCommand: (command: string) => (command === "save" ? state.save : state.clear),
}));
vi.mock("../ui/button", () => ({ Button: "button" }));
vi.mock("../ui/input", () => ({ Input: "input" }));
import { ClickUpOAuthSettings } from "./ClickUpOAuthSettings";

let renderer: ReactTestRenderer;
const environmentId = EnvironmentId.make("test");
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  state.scopes = [AuthAccessWriteScope];
  state.config = { clientId: "", redirectUri: "", hasClientSecret: false, source: "none" };
  state.configQuery.mockReset().mockReturnValue("configuration");
  state.save.mockReset().mockResolvedValue(AsyncResult.success({}));
  state.clear.mockReset().mockResolvedValue(AsyncResult.success({}));
  state.refresh.mockReset();
});
afterEach(async () => {
  await act(async () => renderer?.unmount());
  vi.unstubAllGlobals();
});
async function render(isPrimary = true) {
  await act(async () => {
    renderer = create(<ClickUpOAuthSettings environmentId={environmentId} isPrimary={isPrimary} />);
  });
}
function button(text: string) {
  return renderer.root.findAllByType("button").find((node) => node.children.includes(text))!;
}
function input(suffix: string) {
  return renderer.root.findAllByType("input").find((node) => node.props.id.endsWith(suffix))!;
}
async function type(suffix: string, value: string) {
  await act(async () => input(suffix).props.onChange({ target: { value } }));
}
async function submit() {
  await act(async () => renderer.root.findByType("form").props.onSubmit({ preventDefault() {} }));
}

it("opens initial setup and saves the exact callback URL, then clears the secret and refreshes connection", async () => {
  await render();
  expect(input("redirect").props.value).toBe(
    "http://localhost:6326/api/integrations/clickup/callback",
  );
  await type("client", "client-id");
  await type("secret", "secret-value");
  await submit();
  expect(state.save).toHaveBeenCalledWith({
    environmentId,
    input: {
      clientId: "client-id",
      clientSecret: "secret-value",
      redirectUri: "http://localhost:6326/api/integrations/clickup/callback",
    },
  });
  expect(state.refresh.mock.calls).toEqual([["configuration"], ["connection"]]);
  await act(async () => button("Configure OAuth app").props.onClick());
  expect(input("secret").props.value).toBe("");
});

it("preserves an existing secret by omitting a blank replacement", async () => {
  state.config = {
    clientId: "client-id",
    redirectUri: "https://example.com/callback",
    hasClientSecret: true,
    source: "saved",
  };
  await render();
  await act(async () => button("Configure OAuth app").props.onClick());
  expect(input("secret").props.value).toBe("");
  await submit();
  expect(state.save).toHaveBeenCalledWith({
    environmentId,
    input: {
      clientId: "client-id",
      redirectUri: "https://example.com/callback",
    },
  });
});

it("retains failed save entries without displaying secret-bearing errors, and cancel clears them", async () => {
  state.save.mockResolvedValue(AsyncResult.fail(new Error("Rejected secret-value")));
  await render();
  await type("client", "client-id");
  await type("secret", "secret-value");
  await submit();
  expect(input("client").props.value).toBe("client-id");
  expect(input("secret").props.value).toBe("secret-value");
  expect(renderer.root.findByProps({ role: "alert" }).children.join("")).not.toContain(
    "secret-value",
  );
  expect(state.refresh).not.toHaveBeenCalled();
  await act(async () => button("Cancel").props.onClick());
  await act(async () => button("Configure OAuth app").props.onClick());
  expect(input("secret").props.value).toBe("");
  expect(input("client").props.value).toBe("");
});

it("requires a new secret when changing the Client ID", async () => {
  state.config = {
    clientId: "client-id",
    redirectUri: "https://example.com/callback",
    hasClientSecret: true,
    source: "saved",
  };
  await render();
  await act(async () => button("Configure OAuth app").props.onClick());
  await type("client", "new-client-id");
  expect(input("secret").props.required).toBe(true);
  expect(input("secret").props.placeholder).toContain("new Client ID");
  expect(button("Save configuration").props.disabled).toBe(true);
  await type("secret", "replacement-secret");
  expect(button("Save configuration").props.disabled).toBe(false);
  await submit();
  expect(state.save).toHaveBeenCalledWith({
    environmentId,
    input: {
      clientId: "new-client-id",
      clientSecret: "replacement-secret",
      redirectUri: "https://example.com/callback",
    },
  });
});

it("removes only saved app configuration through the separate command", async () => {
  state.config = {
    clientId: "client-id",
    redirectUri: "https://example.com/callback",
    hasClientSecret: true,
    source: "saved",
  };
  await render();
  await act(async () => button("Configure OAuth app").props.onClick());
  await act(async () => button("Remove saved configuration").props.onClick());
  expect(state.clear).toHaveBeenCalledWith({ environmentId, input: {} });
  expect(state.save).not.toHaveBeenCalled();
  expect(state.refresh.mock.calls).toEqual([["configuration"], ["connection"]]);
});

it.each([true, false])(
  "withholds configuration queries without administrative access (primary %s)",
  async (isPrimary) => {
    state.scopes = [];
    await render(isPrimary);
    expect(state.configQuery).not.toHaveBeenCalled();
    expect(renderer.toJSON()).toBeNull();
  },
);
