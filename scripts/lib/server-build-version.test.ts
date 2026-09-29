import * as NodeURL from "node:url";

import { describe, expect, it } from "@effect/vitest";
import { Rolldown } from "vite-plus/pack";

import serverPackageJson from "../../apps/server/package.json" with { type: "json" };
import rootPackageJson from "../../package.json" with { type: "json" };
import { serverBuildVersionPlugin } from "./server-build-version.ts";

describe("server build version", () => {
  it.each(["0.0.43-nightly.20260929.2428.4", serverPackageJson.version])(
    "bundles %s into server metadata without changing other manifests",
    async (version) => {
      const serverPath = NodeURL.fileURLToPath(
        new URL("../../apps/server/package.json", import.meta.url),
      );
      const rootPath = NodeURL.fileURLToPath(new URL("../../package.json", import.meta.url));
      const bundle = await Rolldown.rolldown({
        input: "version-fixture",
        plugins: [
          {
            name: "version-fixture",
            resolveId(id) {
              return id === "version-fixture" ? id : null;
            },
            load(id) {
              if (id !== "version-fixture") return null;
              return `import server from ${JSON.stringify(serverPath)} with { type: "json" };
                import root from ${JSON.stringify(rootPath)} with { type: "json" };
                export default { server: server.version, name: server.name, root: root.name };`;
            },
          },
          serverBuildVersionPlugin(version),
        ],
      });
      try {
        const { output } = await bundle.generate({ format: "es" });
        const chunk = output.find((item) => item.type === "chunk");
        expect(chunk).toBeDefined();
        const result = await import(
          `data:text/javascript;base64,${Buffer.from(chunk!.code).toString("base64")}`
        );
        expect(result.default).toEqual({
          server: version,
          name: serverPackageJson.name,
          root: rootPackageJson.name,
        });
      } finally {
        await bundle.close();
      }
    },
  );
});
