import * as NodeEvents from "node:events";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const native = vi.hoisted(() => ({ spawn: vi.fn() }));
vi.mock("node:child_process", () => ({ spawn: native.spawn }));

import { createMacKeepAwake } from "./MacKeepAwake.ts";

function fakeChild() {
  const child = new NodeEvents.EventEmitter();
  return Object.assign(child, {
    kill: vi.fn(() => {
      queueMicrotask(() => child.emit("close", null, "SIGTERM"));
      return true;
    }),
  });
}

beforeEach(() => native.spawn.mockReset());

describe("Mac keep awake", () => {
  it("serializes duplicate starts, uses all assertions, and stops only its child", async () => {
    const child = fakeChild();
    native.spawn.mockImplementation(() => {
      queueMicrotask(() => child.emit("spawn"));
      return child;
    });
    const changed = vi.fn();
    const controller = createMacKeepAwake(123, changed);
    expect(controller.getState()).toEqual({ enabled: false, error: null });
    const results = await Promise.all([controller.setEnabled(true), controller.setEnabled(true)]);
    expect(results).toEqual([
      { enabled: true, error: null },
      { enabled: true, error: null },
    ]);
    expect(native.spawn).toHaveBeenCalledExactlyOnceWith(
      "/usr/bin/caffeinate",
      ["-dims", "-w", "123"],
      { stdio: "ignore" },
    );
    expect(await controller.setEnabled(false)).toEqual({ enabled: false, error: null });
    expect(child.kill).toHaveBeenCalledTimes(1);
    await controller.dispose();
    expect(child.kill).toHaveBeenCalledTimes(1);
  });

  it("reports unexpected exit and can restart", async () => {
    const children: ReturnType<typeof fakeChild>[] = [];
    native.spawn.mockImplementation(() => {
      const child = fakeChild();
      children.push(child);
      queueMicrotask(() => child.emit("spawn"));
      return child;
    });
    const changed = vi.fn();
    const controller = createMacKeepAwake(123, changed);
    await controller.setEnabled(true);
    children[0]!.emit("close", 1, null);
    expect(changed).toHaveBeenLastCalledWith({
      enabled: false,
      error: "Keep awake stopped (1).",
    });
    expect(await controller.setEnabled(true)).toEqual({ enabled: true, error: null });
    await controller.dispose();
    expect(children[0]!.kill).not.toHaveBeenCalled();
    expect(children[1]!.kill).toHaveBeenCalledTimes(1);
  });

  it("surfaces spawn errors once and allows a retry after close", async () => {
    const child = fakeChild();
    native.spawn.mockImplementationOnce(() => {
      queueMicrotask(() => {
        child.emit("error", new Error("Permission denied"));
        child.emit("close", -1, null);
      });
      return child;
    });
    const changed = vi.fn();
    const controller = createMacKeepAwake(123, changed);
    expect(await controller.setEnabled(true)).toEqual({
      enabled: false,
      error: "Permission denied",
    });
    expect(changed).toHaveBeenCalledTimes(1);
    const retry = fakeChild();
    native.spawn.mockImplementationOnce(() => {
      queueMicrotask(() => retry.emit("spawn"));
      return retry;
    });
    expect(await controller.setEnabled(true)).toEqual({ enabled: true, error: null });
    await controller.dispose();
  });

  it("allows retry when spawn throws synchronously", async () => {
    native.spawn.mockImplementationOnce(() => {
      throw new Error("Cannot spawn");
    });
    const controller = createMacKeepAwake(123, vi.fn());
    await expect(controller.setEnabled(true)).rejects.toThrow("Cannot spawn");
    const child = fakeChild();
    native.spawn.mockImplementationOnce(() => {
      queueMicrotask(() => child.emit("spawn"));
      return child;
    });
    expect(await controller.setEnabled(true)).toEqual({ enabled: true, error: null });
    await controller.dispose();
  });

  it("cancels a start that is still spawning when disposed", async () => {
    const child = fakeChild();
    let spawned!: () => void;
    const spawning = new Promise<void>((resolve) => {
      spawned = resolve;
    });
    native.spawn.mockImplementationOnce(() => {
      spawned();
      return child;
    });
    const changed = vi.fn();
    const controller = createMacKeepAwake(123, changed);
    const enabled = controller.setEnabled(true);
    await spawning;
    const disposed = controller.dispose();
    child.emit("spawn");
    await Promise.all([enabled, disposed]);
    expect(controller.getState().enabled).toBe(false);
    expect(changed).not.toHaveBeenCalledWith({ enabled: true, error: null });
    await controller.setEnabled(true);
    expect(native.spawn).toHaveBeenCalledTimes(1);
  });

  it("honors off queued while a start is pending", async () => {
    const child = fakeChild();
    native.spawn.mockImplementation(() => {
      queueMicrotask(() => child.emit("spawn"));
      return child;
    });
    const controller = createMacKeepAwake(123, vi.fn());
    await Promise.all([controller.setEnabled(true), controller.setEnabled(false)]);
    expect(controller.getState()).toEqual({ enabled: false, error: null });
    expect(child.kill).toHaveBeenCalledTimes(1);
    await controller.dispose();
  });
});
