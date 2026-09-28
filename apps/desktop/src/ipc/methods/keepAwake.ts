import * as Electron from "electron";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { DesktopKeepAwakeState } from "@t3tools/contracts";
import { HostProcessPlatform } from "@t3tools/shared/hostProcess";

import { createMacKeepAwake } from "../../app/MacKeepAwake.ts";
import * as ElectronApp from "../../electron/ElectronApp.ts";
import * as DesktopIpc from "../DesktopIpc.ts";
import {
  GET_KEEP_AWAKE_STATE_CHANNEL,
  KEEP_AWAKE_STATE_CHANNEL,
  SET_KEEP_AWAKE_ENABLED_CHANNEL,
} from "../channels.ts";

export const installKeepAwake = Effect.fn("desktop.ipc.installKeepAwake")(function* () {
  const platform = yield* HostProcessPlatform;
  if (platform !== "darwin") return;
  const ipc = yield* DesktopIpc.DesktopIpc;
  const app = yield* ElectronApp.ElectronApp;
  const controller = createMacKeepAwake(process.pid, (state) => {
    for (const window of Electron.BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) window.webContents.send(KEEP_AWAKE_STATE_CHANNEL, state);
    }
  });
  yield* Effect.addFinalizer(() => Effect.promise(controller.dispose));
  yield* app.on("will-quit", () => {
    void controller.dispose();
  });
  yield* ipc.handle(
    DesktopIpc.makeIpcMethod({
      channel: GET_KEEP_AWAKE_STATE_CHANNEL,
      payload: Schema.Void,
      result: DesktopKeepAwakeState,
      handler: () => Effect.sync(controller.getState),
    }),
  );
  yield* ipc.handle(
    DesktopIpc.makeIpcMethod({
      channel: SET_KEEP_AWAKE_ENABLED_CHANNEL,
      payload: Schema.Boolean,
      result: DesktopKeepAwakeState,
      handler: (enabled) => Effect.tryPromise(() => controller.setEnabled(enabled)),
    }),
  );
});
