import { it, assert } from "@effect/vitest";
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
import { collectEstimationEvidence, researchablePath } from "./ClickUpEstimationResearch.ts";

const plan = (files: string[], searches: string[] = []): TaskEstimationResponse => ({
  summary: "Inspect checkout condition and tests",
  files: files.map((value) => ({ repository: 0, value })),
  searches: searches.map((value) => ({ repository: 0, value })),
  estimate: null,
});
const harness = (plans = [plan(["src/pay.ts", "src/pay.test.ts"])], searchLine = 1) => {
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
      searchContents: () =>
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
  return { contents, readFile, generate, dependencies };
};
const input = {
  repositories: [{ cwd: "/repo", title: "App" }],
  snapshot: "Fix cash-order Pay button",
  cwd: "/temporary-analysis",
  modelSelection: DEFAULT_SERVER_SETTINGS.textGenerationModelSelection,
};

it.effect(
  "provides inspected implementation and tests to follow-up research and detects code changes",
  () =>
    Effect.gen(function* () {
      const h = harness();
      const result = yield* collectEstimationEvidence(input).pipe(Effect.provide(h.dependencies));
      assert.isTrue(result.hasImplementation);
      assert.include(result.context, "order.method");
      assert.include(result.context, "src/pay.test.ts");
      assert.include(h.generate.mock.calls[1]?.[0]?.prompt ?? "", "src/pay.ts");
      h.contents.set("src/pay.ts", "Changed during estimation");
      assert.equal((yield* Effect.result(result.verify))._tag, "Failure");
    }),
);
it.effect("rejects absolute, escaping, secret and unlisted planner paths", () =>
  Effect.gen(function* () {
    const h = harness([plan(["/etc/passwd", "../secret", ".env", "C:\\secret", "unlisted.ts"])]);
    const result = yield* collectEstimationEvidence(input).pipe(Effect.provide(h.dependencies));
    assert.isFalse(result.hasImplementation);
    assert.deepEqual(
      h.readFile.mock.calls.map((c) => c[0].relativePath),
      ["package.json"],
    );
    assert.isTrue(result.limitations.some((l) => l.includes("Rejected")));
  }),
);
it.effect("uses contained reads instead of forwarding raw search-index text", () =>
  Effect.gen(function* () {
    const h = harness([plan([], ["cash"])]);
    const result = yield* collectEstimationEvidence(input).pipe(Effect.provide(h.dependencies));
    assert.isTrue(result.hasImplementation);
    assert.notInclude(result.context, "Do not expose raw index contents");
    assert.include(result.context, "order.method");
  }),
);
it.effect("stops bounded research after three passes", () =>
  Effect.gen(function* () {
    const h = harness(Array.from({ length: 10 }, () => plan(["src/pay.ts"])));
    yield* collectEstimationEvidence(input).pipe(Effect.provide(h.dependencies));
    assert.equal(h.generate.mock.calls.length, 3);
  }),
);
it("recognizes only safe relative source paths", () => {
  for (const path of [
    "/tmp/secret",
    "../secret",
    ".env.production",
    "foo/../../bar",
    "C:/secret",
    "foo\\bar",
    "cert.pem",
  ])
    assert.isFalse(researchablePath(path));
  assert.isTrue(researchablePath("src/checkout.ts"));
});

it.effect(
  "includes search hits beyond the first excerpt and detects changes outside the excerpt",
  () =>
    Effect.gen(function* () {
      const h = harness([plan([], ["cash"])], 1000);
      h.contents.set(
        "src/pay.ts",
        "// context line with unrelated logic\n".repeat(999) + "export const cash = true;\n",
      );
      const result = yield* collectEstimationEvidence(input).pipe(Effect.provide(h.dependencies));
      assert.include(result.context, "export const cash = true");
      h.contents.set("src/pay.ts", "// changed first line\n" + h.contents.get("src/pay.ts"));
      assert.equal((yield* Effect.result(result.verify))._tag, "Failure");
    }),
);
