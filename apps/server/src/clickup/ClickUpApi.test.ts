import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Deferred from "effect/Deferred";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import { HttpClient, HttpClientResponse } from "effect/unstable/http";
import { ClickUpApi, layer } from "./ClickUpApi.ts";

it.effect("coalesces pending reads by token and path without retaining completed responses", () =>
  Effect.gen(function* () {
    const release = yield* Deferred.make<void>();
    const calls: string[] = [];
    const client = HttpClient.make((request) =>
      Effect.gen(function* () {
        calls.push(`${request.headers.authorization}:${request.url}`);
        yield* Deferred.await(release);
        return HttpClientResponse.fromWeb(request, Response.json({ value: calls.length }));
      }),
    );
    yield* Effect.gen(function* () {
      const api = yield* ClickUpApi;
      const read = (path: string, token: string) =>
        Effect.forkChild(api.request(path, { token }), { startImmediately: true });
      const first = yield* read("task/one", "token-one");
      const duplicate = yield* read("task/one", "token-one");
      const otherAccount = yield* read("task/one", "token-two");
      const otherPath = yield* read("task/two", "token-one");
      assert.equal(calls.length, 3);
      yield* Deferred.succeed(release, undefined);
      const results = yield* Effect.forEach(
        [first, duplicate, otherAccount, otherPath],
        Fiber.join,
      );
      assert.deepEqual(results[0], results[1]);
      yield* api.request("task/one", { token: "token-one" });
      assert.equal(calls.length, 4);
    }).pipe(
      Effect.provide(layer.pipe(Layer.provide(Layer.succeed(HttpClient.HttpClient, client)))),
    );
  }),
);

it.effect("does not merge writes or reuse pre-write reads and allows failed reads to retry", () =>
  Effect.gen(function* () {
    const release = yield* Deferred.make<void>();
    let reads = 0;
    let writes = 0;
    const client = HttpClient.make((request) =>
      Effect.gen(function* () {
        if (request.method !== "GET") {
          writes += 1;
          return HttpClientResponse.fromWeb(request, new Response(null, { status: 204 }));
        }
        const read = ++reads;
        yield* Deferred.await(release);
        return HttpClientResponse.fromWeb(
          request,
          read === 1 ? new Response(null, { status: 503 }) : Response.json({ read }),
        );
      }),
    );
    yield* Effect.gen(function* () {
      const api = yield* ClickUpApi;
      const before = yield* Effect.forkChild(Effect.result(api.request("task/one")), {
        startImmediately: true,
      });
      yield* api.request("task/one", { method: "PUT", body: { status: "done" } });
      yield* api.request("task/one", { method: "PUT", body: { status: "done" } });
      const after = yield* Effect.forkChild(api.request("task/one"), { startImmediately: true });
      assert.equal(reads, 2);
      assert.equal(writes, 2);
      yield* Deferred.succeed(release, undefined);
      assert.equal((yield* Fiber.join(before))._tag, "Failure");
      assert.deepEqual(yield* Fiber.join(after), { read: 2 });
      assert.deepEqual(yield* api.request("task/one"), { read: 3 });
    }).pipe(
      Effect.provide(layer.pipe(Layer.provide(Layer.succeed(HttpClient.HttpClient, client)))),
    );
  }),
);

it.effect("keeps API error bodies out of errors and does not retry failed requests", () => {
  let requests = 0;
  return Effect.gen(function* () {
    const api = yield* ClickUpApi;
    const result = yield* Effect.result(api.request("user", { token: "fixture-token" }));
    assert.equal(result._tag, "Failure");
    if (result._tag === "Failure")
      assert.equal(result.failure.message, "ClickUp rate limit reached. Wait before refreshing.");
    assert.equal(requests, 1);
    assert.equal(
      (yield* Effect.result(api.request("user", { token: "fixture-token" })))._tag,
      "Failure",
    );
    assert.equal(requests, 2);
  }).pipe(
    Effect.provide(
      layer.pipe(
        Layer.provide(
          Layer.succeed(
            HttpClient.HttpClient,
            HttpClient.make((request) => {
              requests += 1;
              assert.equal(request.headers.authorization, "Bearer fixture-token");
              return Effect.succeed(
                HttpClientResponse.fromWeb(
                  request,
                  new Response("private diagnostic text", { status: 429 }),
                ),
              );
            }),
          ),
        ),
      ),
    ),
  );
});

it.effect(
  "sends explicit mutation methods and accepts empty success while preserving OAuth POST",
  () => {
    const methods: string[] = [];
    return Effect.gen(function* () {
      const api = yield* ClickUpApi;
      assert.equal(
        yield* api.request("comment/123", {
          token: "fixture-token",
          method: "PUT",
          body: { resolved: true },
        }),
        null,
      );
      yield* api.request("task/abc/tag/estimate", { token: "fixture-token", method: "DELETE" });
      yield* api.request("oauth/token", { body: { code: "fixture-code" } });
      assert.deepEqual(methods, ["PUT", "DELETE", "POST"]);
    }).pipe(
      Effect.provide(
        layer.pipe(
          Layer.provide(
            Layer.succeed(
              HttpClient.HttpClient,
              HttpClient.make((request) => {
                methods.push(request.method);
                if (request.method === "PUT") {
                  assert.equal(request.body._tag, "Uint8Array");
                  if (request.body._tag === "Uint8Array")
                    assert.equal(new TextDecoder().decode(request.body.body), '{"resolved":true}');
                }
                return Effect.succeed(
                  HttpClientResponse.fromWeb(request, new Response(null, { status: 204 })),
                );
              }),
            ),
          ),
        ),
      ),
    );
  },
);
