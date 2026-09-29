import * as NodeURL from "node:url";

import serverPackageJson from "../../apps/server/package.json" with { type: "json" };

const serverPackagePath = NodeURL.fileURLToPath(
  new URL("../../apps/server/package.json", import.meta.url),
).replaceAll("\\", "/");

export function serverBuildVersionPlugin(buildVersion: string) {
  return {
    name: "t3-server-build-version",
    load(id: string) {
      if (id.replaceAll("\\", "/") !== serverPackagePath) return null;
      // Keep every bundled version consumer in sync without changing the checkout's manifest.
      return {
        code: `export default ${JSON.stringify({ ...serverPackageJson, version: buildVersion })};`,
        moduleType: "js" as const,
      };
    },
  };
}
