import { EnvironmentId, type ClickUpConnection } from "@t3tools/contracts";
import { AsyncResult } from "effect/unstable/reactivity";
import { act } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";

const fixture = vi.hoisted(() => ({
  result: null as AsyncResult.AsyncResult<ClickUpConnection, unknown> | null,
  listeners: new Set<() => void>(),
  query: {},
  connect: vi.fn(),
  disconnect: vi.fn(),
  refresh: vi.fn(),
  openExternal: vi.fn(),
}));
vi.mock("@effect/atom-react", async () => {
  const { useSyncExternalStore } = await import("react");
  return {
    useAtomValue: () =>
      useSyncExternalStore(
        (listener) => {
          fixture.listeners.add(listener);
          return () => fixture.listeners.delete(listener);
        },
        () => fixture.result,
      ),
  };
});
vi.mock("../../state/server", () => ({
  serverEnvironment: {
    clickUpConnection: () => fixture.query,
    clickUpConnect: "connect",
    clickUpDisconnect: "disconnect",
  },
}));
vi.mock("../../state/use-atom-command", () => ({
  useAtomCommand: (command: string) =>
    command === "connect" ? fixture.connect : fixture.disconnect,
}));
vi.mock("../../rpc/atomRegistry", () => ({ appAtomRegistry: { refresh: fixture.refresh } }));
vi.mock("../../localApi", () => ({
  ensureLocalApi: () => ({ shell: { openExternal: fixture.openExternal } }),
}));
vi.mock("../ui/button", () => ({ Button: "button" }));
vi.mock("../ui/toast", () => ({ toastManager: { add: vi.fn() } }));
import { toastManager } from "../ui/toast";
import { ClickUpConnectionCard } from "./ClickUpConnectionCard";

const disconnected: ClickUpConnection = { configured: true, user: null, workspaces: [] };
const url = "https://app.clickup.com/api?state=fixture";
let renderer: ReactTestRenderer | null;
let browser: EventTarget & {
  desktopBridge: object | undefined;
  location: { assign: ReturnType<typeof vi.fn> };
};
let page: EventTarget & { visibilityState: string };

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  fixture.result = AsyncResult.success(disconnected);
  fixture.listeners.clear();
  fixture.connect.mockReset().mockResolvedValue({ _tag: "Success", value: { url } });
  fixture.disconnect.mockReset().mockResolvedValue({ _tag: "Success" });
  fixture.refresh.mockReset();
  fixture.openExternal.mockReset().mockResolvedValue(undefined);
  vi.mocked(toastManager.add).mockClear();
  browser = Object.assign(new EventTarget(), {
    desktopBridge: {} as object | undefined,
    location: { assign: vi.fn() },
    setInterval,
    clearInterval,
    setTimeout,
    clearTimeout,
  });
  page = Object.assign(new EventTarget(), { visibilityState: "visible" });
  vi.stubGlobal("window", browser);
  vi.stubGlobal("document", page);
  renderer = null;
});
afterEach(async () => {
  await act(async () => renderer?.unmount());
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
async function render() {
  await act(async () => {
    renderer = create(<ClickUpConnectionCard environmentId={EnvironmentId.make("test")} />);
  });
}
async function publish(result: AsyncResult.AsyncResult<ClickUpConnection, unknown>) {
  await act(async () => {
    fixture.result = result;
    fixture.listeners.forEach((listener) => listener());
  });
}
async function click() {
  await act(async () => {
    await renderer!.root.findByType("button").props.onClick();
  });
}
async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

it("opens desktop authorization and detects completion without a second click", async () => {
  let resolve!: (value: unknown) => void;
  fixture.connect.mockReturnValue(
    new Promise((done) => {
      resolve = done;
    }),
  );
  await render();
  await click();
  expect(fixture.openExternal).not.toHaveBeenCalled();
  await act(async () => {
    resolve({ _tag: "Success", value: { url } });
  });
  expect(fixture.openExternal).toHaveBeenCalledWith(url);
  await advance(2_000);
  expect(fixture.refresh).toHaveBeenCalledOnce();
  await publish(AsyncResult.success({ ...disconnected, user: { id: 17, username: "Developer" } }));
  expect(renderer!.root.findByType("button").children).toEqual(["Disconnect"]);
  expect(JSON.stringify(renderer!.toJSON())).toContain("Connected as Developer");
  fixture.refresh.mockClear();
  await advance(4_000);
  expect(fixture.refresh).not.toHaveBeenCalled();
  await click();
  expect(fixture.disconnect).toHaveBeenCalledOnce();
  expect(fixture.refresh).toHaveBeenCalledOnce();
});

it("redirects web authorization in the current tab and retries failed initiation", async () => {
  browser.desktopBridge = undefined;
  fixture.connect.mockResolvedValueOnce({ _tag: "Failure" });
  await render();
  await click();
  expect(browser.location.assign).not.toHaveBeenCalled();
  await advance(2_000);
  expect(fixture.refresh).not.toHaveBeenCalled();
  await click();
  expect(browser.location.assign).toHaveBeenCalledWith(url);
  expect(fixture.connect).toHaveBeenLastCalledWith({
    environmentId: "test",
    input: { returnToApp: true },
  });
  expect(fixture.openExternal).not.toHaveBeenCalled();
});

it("uses the desktop external browser bridge and recovers from a failed open", async () => {
  browser.desktopBridge = {};
  fixture.openExternal.mockRejectedValueOnce(new Error("Cannot open browser"));
  await render();
  await click();
  expect(browser.location.assign).not.toHaveBeenCalled();
  expect(fixture.openExternal).toHaveBeenCalledWith(url);
  expect(toastManager.add).toHaveBeenCalledWith(expect.objectContaining({ type: "error" }));
  await click();
  await advance(2_000);
  expect(fixture.refresh).toHaveBeenCalledOnce();
});

it("skips hidden and in-flight checks, refreshes on return, and cleans up on unmount", async () => {
  await render();
  await click();
  page.visibilityState = "hidden";
  await advance(4_000);
  expect(fixture.refresh).not.toHaveBeenCalled();
  page.visibilityState = "visible";
  await act(async () => {
    browser.dispatchEvent(new Event("focus"));
  });
  expect(fixture.refresh).toHaveBeenCalledOnce();
  await publish(AsyncResult.waiting(AsyncResult.success(disconnected)));
  fixture.refresh.mockClear();
  await advance(4_000);
  expect(fixture.refresh).not.toHaveBeenCalled();
  await act(async () => {
    renderer!.unmount();
    renderer = null;
  });
  browser.dispatchEvent(new Event("focus"));
  await advance(4_000);
  expect(fixture.refresh).not.toHaveBeenCalled();
});

it("bounds sign-in checks and returns to Connect when authorization expires", async () => {
  await render();
  await click();
  await advance(10 * 60_000);
  expect(renderer!.root.findByType("button").children).toEqual(["Connect ClickUp"]);
  expect(toastManager.add).toHaveBeenCalledWith(
    expect.objectContaining({ title: expect.stringContaining("timed out") }),
  );
  fixture.refresh.mockClear();
  await advance(4_000);
  expect(fixture.refresh).not.toHaveBeenCalled();
});
