import * as NodeEvents from "node:events";
import * as Effect from "effect/Effect";
import { beforeEach, expect, vi } from "vite-plus/test";
import { it } from "@effect/vitest";
import { HostProcessPlatform } from "@t3tools/shared/hostProcess";

const native = vi.hoisted(() => ({
  spawn: vi.fn(),
  send: vi.fn(),
  listeners: new Map<string, () => void>(),
}));
vi.mock("node:child_process", () => ({ spawn: native.spawn }));
vi.mock("electron", () => ({
  app: {
    on: (event: string, listener: () => void) => native.listeners.set(event, listener),
    removeListener: (event: string) => native.listeners.delete(event),
  },
  BrowserWindow: {
    getAllWindows: () => [{ isDestroyed: () => false, webContents: { send: native.send } }],
  },
}));

import * as ElectronApp from "../../electron/ElectronApp.ts";
import * as DesktopIpc from "../DesktopIpc.ts";
import { installKeepAwake } from "./keepAwake.ts";

beforeEach(() => {
  vi.clearAllMocks();
  native.listeners.clear();
});

it.effect.each(["quit", "disposal"])("validates IPC and stops on %s", (cleanup) =>
  Effect.gen(function* () {
    const child = new NodeEvents.EventEmitter();
    const kill = vi.fn(() => {
      queueMicrotask(() => child.emit("close", null, "SIGTERM"));
      return true;
    });
    native.spawn.mockImplementation(() => {
      queueMicrotask(() => child.emit("spawn"));
      return Object.assign(child, { kill });
    });
    const handlers = new Map<string, DesktopIpc.DesktopIpcHandleListener>();
    yield* Effect.scoped(
      Effect.gen(function* () {
        yield* installKeepAwake();
        const event = { sender: { id: 1 } };
        const set = handlers.get("desktop:set-keep-awake-enabled")!;
        const get = handlers.get("desktop:get-keep-awake-state")!;
        for (const invalid of ["true", 1, null, { enabled: true }]) {
          yield* Effect.promise(() => expect(set(event, invalid)).rejects.toBeDefined());
        }
        expect(native.spawn).not.toHaveBeenCalled();
        yield* Effect.promise(() =>
          expect(set(event, true)).resolves.toEqual({ enabled: true, error: null }),
        );
        yield* Effect.promise(() =>
          expect(get(event, undefined)).resolves.toEqual({ enabled: true, error: null }),
        );
        expect(native.send).toHaveBeenCalledWith("desktop:keep-awake-state", {
          enabled: true,
          error: null,
        });
        if (cleanup === "quit") {
          native.listeners.get("will-quit")!();
          expect(kill).toHaveBeenCalledTimes(1);
        }
      }),
    ).pipe(
      Effect.provideService(HostProcessPlatform, "darwin"),
      Effect.provide([
        ElectronApp.layer,
        DesktopIpc.layer({
          handle: (channel, handler) => handlers.set(channel, handler),
          removeHandler: (channel) => handlers.delete(channel),
          on: vi.fn(),
          removeAllListeners: vi.fn(),
        }),
      ]),
    );
    expect(kill).toHaveBeenCalled();
    expect(native.send).toHaveBeenLastCalledWith("desktop:keep-awake-state", {
      enabled: false,
      error: null,
    });
    expect(handlers.size).toBe(0);
    expect(native.listeners.size).toBe(0);
  }),
);

it.effect("does not register native controls on other platforms", () =>
  Effect.scoped(installKeepAwake()).pipe(
    Effect.provideService(HostProcessPlatform, "linux"),
    Effect.provideService(ElectronApp.ElectronApp, {} as ElectronApp.ElectronApp["Service"]),
    Effect.provideService(DesktopIpc.DesktopIpc, {
      handle: () => Effect.die("Must not register"),
      handleSync: () => Effect.die("Must not register"),
    }),
    Effect.tap(() =>
      Effect.sync(() => {
        expect(native.spawn).not.toHaveBeenCalled();
        expect(native.listeners.size).toBe(0);
      }),
    ),
  ),
);
