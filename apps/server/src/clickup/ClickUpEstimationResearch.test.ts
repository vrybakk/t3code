import { it, assert } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { WorkspaceEntriesReadDirectoryError } from "../workspace/WorkspaceEntries.ts";
import { collectEstimationEvidence, researchablePath } from "./ClickUpEstimationResearch.ts";
import { harness, input, plan } from "./ClickUpEstimationResearch.test-fixtures.ts";

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
      const h = harness([plan(["src/pay.ts"]), plan([], ["cash"])], 1000);
      h.contents.set(
        "src/pay.ts",
        "export const header = true;\n" +
          "// context line with unrelated logic\n".repeat(998) +
          "export const cash = true;\n",
      );
      const result = yield* collectEstimationEvidence(input).pipe(Effect.provide(h.dependencies));
      assert.include(result.context, "export const cash = true");
      assert.include(result.context, "export const header = true");
      h.contents.set("src/pay.ts", "// changed first line\n" + h.contents.get("src/pay.ts"));
      assert.equal((yield* Effect.result(result.verify))._tag, "Failure");
    }),
);

it.effect(
  "surfaces relevant source beyond the first 500 paths and retries a bootstrap-only stop",
  () =>
    Effect.gen(function* () {
      const target = "apps/web/src/components/product/product-detail-view.tsx";
      const h = harness([plan([]), plan([target])]);
      h.contents.clear();
      h.contents.set("README.md", "Storefront");
      for (let i = 0; i < 600; i++)
        h.contents.set(`apps/api/a${i}.ts`, "export const unrelated = true;");
      h.contents.set(target, "export const attributes = product.attributes;");
      const result = yield* collectEstimationEvidence({
        ...input,
        taskName: "Fix duplicated product characteristics on Kochere Gr2 Capsules page",
      }).pipe(Effect.provide(h.dependencies));
      assert.include(h.generate.mock.calls[0]![0].prompt, target);
      assert.include(
        h.generate.mock.calls[1]![0].prompt,
        "previous pass stopped without reading implementation",
      );
      assert.include(result.context, "product.attributes");
      assert.isTrue(result.hasImplementation);
    }),
);

it.effect(
  "discovers unlisted filenames despite empty content matches and follows all returned paths",
  () =>
    Effect.gen(function* () {
      const targets = [
        "src/product-detail.tsx",
        "src/product.ts",
        "src/product.test.ts",
        "src/product-utils.ts",
      ];
      const h = harness([plan([], ["product"]), plan([targets[3]!])]);
      h.readFile.mockImplementation(({ relativePath }) =>
        Effect.succeed({
          relativePath,
          contents: targets.includes(relativePath)
            ? "export const attributes = product.attributes;"
            : "{}",
          byteLength: 80,
          truncated: false,
        }),
      );
      h.search.mockImplementation(() =>
        Effect.succeed({
          entries: [
            "dist/product.js",
            "src/pickup.ts",
            ...targets,
            "../outside.ts",
            ".env.product",
          ].map((path) => ({
            path,
            kind: "file" as const,
          })),
          truncated: false,
        }),
      );
      h.searchContents.mockImplementation(() => Effect.succeed({ matches: [], truncated: false }));
      const result = yield* collectEstimationEvidence(input).pipe(Effect.provide(h.dependencies));
      assert.isTrue(result.hasImplementation);
      const reads = h.readFile.mock.calls.map(([request]) => request.relativePath);
      for (const target of targets) assert.include(reads, target);
      for (const excluded of ["dist/product.js", "src/pickup.ts", "../outside.ts", ".env.product"])
        assert.notInclude(reads, excluded);
      assert.equal(h.search.mock.calls[0]![0].query, "product");
    }),
);

it.effect("reports unavailable searches and keeps research bounded without implementation", () =>
  Effect.gen(function* () {
    const h = harness([plan([], ["product"]), plan([]), plan([])]);
    const error = new WorkspaceEntriesReadDirectoryError({
      partialPath: "",
      parentPath: "/repo",
      cause: "Search unavailable",
    });
    h.search.mockImplementation(() => Effect.fail(error));
    h.searchContents.mockImplementation(() => Effect.fail(error));
    const result = yield* collectEstimationEvidence(input).pipe(Effect.provide(h.dependencies));
    assert.isFalse(result.hasImplementation);
    assert.equal(h.generate.mock.calls.length, 3);
    assert.isTrue(
      result.limitations.some((value) => value.includes("filename search unavailable")),
    );
    assert.isTrue(result.limitations.some((value) => value.includes("content search unavailable")));
  }),
);

it.effect(
  "preserves requested implementation when automatic search excerpts would exhaust the budget",
  () =>
    Effect.gen(function* () {
      const filler = Array.from({ length: 6 }, (_, index) => `src/filler${index}.ts`);
      const h = harness([plan(filler), plan(["src/pay.ts"], ["cash"])]);
      for (const path of [...filler, "src/search.ts"]) h.contents.set(path, " ".repeat(16_000));
      h.contents.set(
        "src/pay.ts",
        " ".repeat(14_000) + "export const criticalImplementation = true;",
      );
      h.searchContents.mockImplementation(() =>
        Effect.succeed({
          matches: [{ path: "src/search.ts", lineNumber: 1, lineContent: "cash", matchRanges: [] }],
          truncated: false,
        }),
      );
      const result = yield* collectEstimationEvidence(input).pipe(Effect.provide(h.dependencies));
      assert.include(result.context, "criticalImplementation");
      assert.notInclude(result.context, "src/search.ts");
    }),
);

it.effect("keeps complete file evidence when a later search matches near its end", () =>
  Effect.gen(function* () {
    const h = harness([plan(["src/pay.ts"]), plan([], ["cash"])], 100);
    h.contents.set(
      "src/pay.ts",
      "export const importantHeader = true;\n" +
        "// line with enough context to exceed a small excerpt\n".repeat(450) +
        "export const cash = true;",
    );
    const result = yield* collectEstimationEvidence(input).pipe(Effect.provide(h.dependencies));
    assert.include(result.context, "importantHeader");
    assert.include(result.context, "export const cash = true");
    assert.equal(h.readFile.mock.calls.length, 2);
  }),
);

it.effect("reads a new final-pass dependency after already-covered search hits", () =>
  Effect.gen(function* () {
    const inspected = ["src/pay.ts", "src/pay.test.ts", "src/third.ts"];
    const h = harness([plan(inspected), plan(["package.json"]), plan(["package.json"], ["cash"])]);
    h.contents.set("src/third.ts", "export const third = true;");
    h.contents.set("src/category.ts", "export const categoryRule = true;");
    h.searchContents.mockImplementation(() =>
      Effect.succeed({
        matches: [...inspected, "src/category.ts"].map((path) => ({
          path,
          lineNumber: 1,
          lineContent: "cash",
          matchRanges: [],
        })),
        truncated: false,
      }),
    );
    const result = yield* collectEstimationEvidence(input).pipe(Effect.provide(h.dependencies));
    assert.include(result.context, "categoryRule");
  }),
);
