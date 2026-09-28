// @effect-diagnostics nodeBuiltinImport:off -- This macOS boundary owns the native caffeinate process.
import * as NodeChildProcess from "node:child_process";
import type { DesktopKeepAwakeState } from "@t3tools/contracts";

export function createMacKeepAwake(
  parentPid: number,
  onChange: (state: DesktopKeepAwakeState) => void,
) {
  let state: DesktopKeepAwakeState = { enabled: false, error: null };
  let child: NodeChildProcess.ChildProcess | null = null;
  let exited: Promise<void> = Promise.resolve();
  let disposed = false;
  let stopping = false;
  let pending = Promise.resolve(state);

  const publish = (enabled: boolean, error: string | null = null) => {
    state = { enabled, error };
    onChange(state);
    return state;
  };

  const stop = async () => {
    if (child) {
      stopping = true;
      child.kill();
      await exited;
    }
    return publish(false);
  };

  const start = () => {
    stopping = false;
    // -w releases assertions even if Electron crashes without running its finalizers.
    const process = NodeChildProcess.spawn(
      "/usr/bin/caffeinate",
      ["-dims", "-w", String(parentPid)],
      { stdio: "ignore" },
    );
    child = process;
    exited = new Promise((resolve) => process.once("close", () => resolve()));
    return new Promise<DesktopKeepAwakeState>((resolve) => {
      process.once("spawn", () => {
        if (disposed) {
          process.kill();
          resolve(state);
        } else {
          resolve(publish(true));
        }
      });
      process.on("error", (error) => {
        resolve(publish(false, error.message));
      });
      process.once("close", (code, signal) => {
        child = null;
        if (stopping || disposed) {
          resolve(publish(false));
        } else if (state.error) {
          resolve(state);
        } else {
          resolve(publish(false, `Keep awake stopped (${signal ?? code ?? "unknown"}).`));
        }
      });
    });
  };

  return {
    getState: () => state,
    setEnabled: (enabled: boolean) => {
      const next = pending.then(async () => {
        if (disposed) return state;
        if (!enabled) return stop();
        if (state.enabled) return state;
        // A failed spawn emits error before close; finish reaping it before retrying.
        await exited;
        if (disposed) return state;
        return start();
      });
      pending = next.catch(() => state);
      return next;
    },
    dispose: async () => {
      disposed = true;
      await stop();
    },
  };
}
