import { DEFAULT_SERVER_SETTINGS, type TaskEstimationResponse } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Layer from "effect/Layer";
import * as ChildProcessSpawner from "effect/unstable/process/ChildProcessSpawner";
import { vi } from "vite-plus/test";
import { TextGeneration } from "../textGeneration/TextGeneration.ts";
import { WorkspaceEntries } from "../workspace/WorkspaceEntries.ts";
import { WorkspaceFileSystem } from "../workspace/WorkspaceFileSystem.ts";
import { VcsProcess } from "../vcs/VcsProcess.ts";

export const plan = (files: string[], searches: string[] = []): TaskEstimationResponse => ({
  summary: "Inspect checkout condition and tests",
  files: files.map((value) => ({ repository: 0, value })),
  searches: searches.map((value) => ({ repository: 0, value })),
  estimate: null,
});
export const harness = (plans = [plan(["src/pay.ts", "src/pay.test.ts"])], searchLine = 1) => {
  let index = 0;
  const contents = new Map([
    ["package.json", '{"scripts":{"test":"vitest"}}'],
    ["src/pay.ts", 'export const canPay = (order) => order.method !== "cash";'],
    [
      "src/pay.test.ts",
      'it("does not show Pay for cash", () => expect(canPay(cash)).toBe(false));',
    ],
  ]);
  const readFile = vi.fn(({ relativePath }: { relativePath: string }) =>
    Effect.succeed({
      relativePath,
      contents: contents.get(relativePath) ?? "",
      byteLength: 80,
      truncated: false,
    }),
  );
  const search = vi.fn<WorkspaceEntries["Service"]["search"]>(() =>
    Effect.succeed({ entries: [], truncated: false }),
  );
  const searchContents = vi.fn<WorkspaceEntries["Service"]["searchContents"]>(() =>
    Effect.succeed({
      matches: [
        {
          path: "src/pay.ts",
          lineNumber: searchLine,
          lineContent: "Do not expose raw index contents",
          matchRanges: [],
        },
      ],
      truncated: false,
    }),
  );
  const generate = vi.fn<TextGeneration["Service"]["researchTaskEstimate"]>(() =>
    Effect.succeed(plans[index++] ?? plan([])),
  );
  const dependencies = Layer.mergeAll(
    FileSystem.layerNoop({ realPath: (path) => Effect.succeed(path) }),
    Path.layer,
    Layer.mock(TextGeneration)({ researchTaskEstimate: generate }),
    Layer.mock(WorkspaceEntries)({
      list: () =>
        Effect.succeed({
          entries: [...contents.keys()].map((path) => ({ path, kind: "file" as const })),
          truncated: false,
        }),
      search,
      searchContents,
    }),
    Layer.mock(WorkspaceFileSystem)({ readFile }),
    Layer.mock(VcsProcess)({
      run: () =>
        Effect.succeed({
          stdout: "abc123",
          stderr: "",
          exitCode: ChildProcessSpawner.ExitCode(0),
          stdoutTruncated: false,
          stderrTruncated: false,
        }),
    }),
  );
  return { contents, readFile, generate, search, searchContents, dependencies };
};
export const input = {
  repositories: [{ cwd: "/repo", title: "App" }],
  snapshot: "Fix cash-order Pay button",
  taskName: "Fix cash-order Pay button",
  cwd: "/temporary-analysis",
  modelSelection: DEFAULT_SERVER_SETTINGS.textGenerationModelSelection,
};
