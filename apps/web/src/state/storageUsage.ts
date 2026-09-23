import { WS_METHODS } from "@t3tools/contracts";
import { createEnvironmentRpcCommand } from "@t3tools/client-runtime/state/runtime";

import { connectionAtomRuntime } from "../connection/runtime";

export const storageUsageGet = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "environment-data:storage:usage",
  tag: WS_METHODS.storageUsageGet,
});
