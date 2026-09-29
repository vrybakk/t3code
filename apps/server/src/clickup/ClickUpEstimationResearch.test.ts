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
it.effect("stops repeated file requests after two passes without new evidence", () =>
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
    assert.equal(h.generate.mock.calls.length, 2);
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
        "export const criticalImplementation = true;\n" + "// unrelated line\n".repeat(900),
      );
      h.searchContents.mockImplementation(() =>
        Effect.succeed({
          matches: [{ path: "src/search.ts", lineNumber: 1, lineContent: "cash", matchRanges: [] }],
          truncated: false,
        }),
      );
      const result = yield* collectEstimationEvidence(input).pipe(Effect.provide(h.dependencies));
      assert.include(result.context, "criticalImplementation");
      assert.include(result.context, "src/search.ts");
    }),
);

it.effect("retains the initial excerpt and follows a later hit near the file end", () =>
  Effect.gen(function* () {
    const h = harness([plan(["src/pay.ts"]), plan([], ["cash"])], 452);
    h.contents.set(
      "src/pay.ts",
      "export const importantHeader = true;\n" +
        "// line with enough context to exceed a small excerpt\n".repeat(450) +
        "export const cash = true;",
    );
    const result = yield* collectEstimationEvidence(input).pipe(Effect.provide(h.dependencies));
    assert.include(result.context, "importantHeader");
    assert.include(result.context, "export const cash = true");
    assert.equal(h.readFile.mock.calls.length, 3);
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

it.effect("follows an order dependency discovered after the third research pass", () =>
  Effect.gen(function* () {
    const paths = [
      "src/checkout.ts",
      "src/order-route.ts",
      "src/order-create.ts",
      "src/fulfillment.ts",
    ];
    const h = harness(paths.map((path) => plan([path])));
    for (const [index, path] of paths.entries())
      h.contents.set(
        path,
        `export const dependency${index} = "${paths[index + 1] ?? "invoice-choice"}";`,
      );
    const result = yield* collectEstimationEvidence(input).pipe(Effect.provide(h.dependencies));
    assert.include(result.context, "invoice-choice");
  }),
);

it.effect("reserves room for a focused dependency after broad initial file requests", () =>
  Effect.gen(function* () {
    const filler = Array.from({ length: 6 }, (_, index) => `src/large${index}.ts`);
    const h = harness([plan(filler), plan(["src/order-create.ts"])]);
    for (const path of filler) h.contents.set(path, "export const unrelated = 1;\n".repeat(900));
    h.contents.set("src/order-create.ts", "export const invoiceChoice = order.includeInvoice;");
    const result = yield* collectEstimationEvidence(input).pipe(Effect.provide(h.dependencies));
    assert.include(result.context, "order.includeInvoice");
  }),
);

it.effect("recovers an exact safe path omitted from the initial index", () =>
  Effect.gen(function* () {
    const target = "src/order-create.ts";
    const h = harness([plan([target])]);
    h.search.mockImplementation(() =>
      Effect.succeed({ entries: [{ path: target, kind: "file" }], truncated: false }),
    );
    const originalRead = h.readFile.getMockImplementation()!;
    h.readFile.mockImplementation((request) =>
      request.relativePath === target
        ? Effect.succeed({
            relativePath: target,
            contents: "export const invoiceChoice = true;",
            byteLength: 34,
            truncated: false,
          })
        : originalRead(request),
    );
    const result = yield* collectEstimationEvidence(input).pipe(Effect.provide(h.dependencies));
    assert.include(result.context, "invoiceChoice");
  }),
);

it.effect("bootstrap evidence from eight repositories leaves room for implementation", () =>
  Effect.gen(function* () {
    const h = harness([plan(["src/pay.ts"])]);
    h.contents.set("README.md", "Project documentation\n".repeat(200));
    h.contents.set("AGENTS.md", "Project instructions\n".repeat(200));
    const result = yield* collectEstimationEvidence({
      ...input,
      repositories: Array.from({ length: 8 }, (_, index) => ({
        cwd: `/repo${index}`,
        title: `Repo${index}`,
      })),
    }).pipe(Effect.provide(h.dependencies));
    assert.isTrue(result.hasImplementation);
    assert.include(result.context, "order.method");
    h.contents.set("AGENTS.md", "Changed after eviction");
    assert.equal((yield* Effect.result(result.verify))._tag, "Failure");
  }),
);

it.effect("reads an explicitly requested line beyond an initial window", () =>
  Effect.gen(function* () {
    const h = harness([plan(["src/pay.ts"]), plan(["src/pay.ts:801"])]);
    h.contents.set(
      "src/pay.ts",
      "// unrelated line\n".repeat(800) + "export const finalHandoff = order.invoice;",
    );
    const result = yield* collectEstimationEvidence(input).pipe(Effect.provide(h.dependencies));
    assert.include(result.context, "order.invoice");
    assert.isFalse(result.limitations.some((value) => value.includes("not found")));
  }),
);

it.effect("provides attachment clues during research", () =>
  Effect.gen(function* () {
    const h = harness();
    yield* collectEstimationEvidence({
      ...input,
      imagePaths: ["/tmp/evidence.png"],
      attachmentContext: "Screenshot of unexpected Kyiv note",
    }).pipe(Effect.provide(h.dependencies));
    assert.deepEqual(h.generate.mock.calls[0]![0].imagePaths, ["/tmp/evidence.png"]);
    assert.include(h.generate.mock.calls[0]![0].prompt, "Screenshot of unexpected Kyiv note");
  }),
);

it.effect("bounds research even when every pass finds another dependency", () =>
  Effect.gen(function* () {
    const targets = Array.from({ length: 10 }, (_, index) => `src/dependency${index}.ts`);
    const h = harness(targets.map((path) => plan([path])));
    for (const path of targets) h.contents.set(path, `export const name = '${path}';`);
    const result = yield* collectEstimationEvidence(input).pipe(Effect.provide(h.dependencies));
    assert.equal(h.generate.mock.calls.length, 8);
    assert.include(result.limitations, "Research reached its eight-pass limit.");
  }),
);

it.effect("expands an explicit window starting inside an earlier excerpt", () =>
  Effect.gen(function* () {
    const h = harness([plan(["src/pay.ts"]), plan(["src/pay.ts:200"])]);
    h.contents.set(
      "src/pay.ts",
      "// unrelated line\n".repeat(400) + "export const finalHandoff = order.invoice;",
    );
    const result = yield* collectEstimationEvidence(input).pipe(Effect.provide(h.dependencies));
    assert.include(result.context, "order.invoice");
  }),
);

it.effect("expands bootstrap metadata when explicitly requested during research", () =>
  Effect.gen(function* () {
    const h = harness([plan(["package.json", "src/pay.ts"])]);
    h.contents.set(
      "package.json",
      '{"metadata":[\n' +
        Array(150).fill('"package information"').join(",\n") +
        '\n],"scripts":{"test":"run-focused-checkout-tests"}}',
    );
    const result = yield* collectEstimationEvidence(input).pipe(Effect.provide(h.dependencies));
    assert.include(result.context, "run-focused-checkout-tests");
  }),
);
