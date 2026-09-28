import { it, assert } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import { FetchHttpClient } from "effect/unstable/http";
import { vi } from "vite-plus/test";
import { collectEstimationAttachments } from "./ClickUpEstimationAttachments.ts";

const attachment = {
  id: "1",
  name: "requirements.txt",
  url: "https://attachments.clickup.com/requirements.txt",
  mimeType: "text/plain",
};
const run = (fetch: typeof globalThis.fetch, attachments = [attachment], imagesSupported = false) =>
  collectEstimationAttachments(attachments, "/temp", imagesSupported).pipe(
    Effect.provideService(FetchHttpClient.Fetch, fetch),
    Effect.provide(
      Layer.mergeAll(FileSystem.layerNoop({ writeFile: () => Effect.void }), Path.layer),
    ),
  );
it.effect("supplies actual downloaded text without sending credentials", () =>
  Effect.gen(function* () {
    const fetch = vi.fn<typeof globalThis.fetch>(async (_, init) => {
      assert.equal(new Headers(init?.headers).get("authorization"), null);
      assert.equal(init?.redirect, "manual");
      return new Response("Expected: hide Pay for cash orders", {
        headers: { "content-type": "text/plain" },
      });
    });
    const result = yield* run(fetch);
    assert.equal(result.evidence[0]?.text, "Expected: hide Pay for cash orders");
    assert.equal(result.limitations.length, 0);
  }),
);
it.effect("rejects off-host attachments and redirects before requesting them", () =>
  Effect.gen(function* () {
    const fetch = vi.fn<typeof globalThis.fetch>(
      async () =>
        new Response(null, { status: 302, headers: { location: "http://127.0.0.1/secrets" } }),
    );
    const result = yield* run(fetch, [
      attachment,
      { ...attachment, url: "https://example.com/file" },
    ]);
    assert.equal(fetch.mock.calls.length, 1);
    assert.equal(result.limitations.length, 2);
  }),
);
it.effect("reports oversized and unsupported attachments instead of claiming inspection", () =>
  Effect.gen(function* () {
    const fetch = vi.fn<typeof globalThis.fetch>(
      async () => new Response("x".repeat(500_001), { headers: { "content-type": "text/plain" } }),
    );
    const result = yield* run(fetch, [
      attachment,
      { ...attachment, name: "screen.png", mimeType: "image/png" },
      { ...attachment, name: "spec.pdf", mimeType: "application/pdf" },
    ]);
    assert.equal(fetch.mock.calls.length, 1);
    assert.equal(result.limitations.length, 3);
    assert.equal(result.imagePaths.length, 0);
  }),
);
it.effect("materializes supported images for the Codex estimator", () =>
  Effect.gen(function* () {
    const result = yield* run(
      async () =>
        new Response(new Uint8Array([137, 80, 78, 71]), {
          headers: { "content-type": "image/png" },
        }),
      [{ ...attachment, name: "screen.png", mimeType: "image/png" }],
      true,
    );
    assert.deepEqual(result.imagePaths, ["/temp/task-evidence-0.png"]);
    assert.include(result.evidence[0]!.status, "Image supplied");
  }),
);
