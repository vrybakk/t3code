import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { HttpClient, HttpClientResponse } from "effect/unstable/http";
import { ClickUpApi, layer } from "./ClickUpApi.ts";

it.effect("keeps API error bodies out of errors and does not retry failed requests", () => {
  let requests = 0;
  return Effect.gen(function* () {
    const api = yield* ClickUpApi;
    const result = yield* Effect.result(api.request("user", { token: "fixture-token" }));
    assert.equal(result._tag, "Failure");
    if (result._tag === "Failure")
      assert.equal(result.failure.message, "ClickUp rate limit reached. Wait before refreshing.");
    assert.equal(requests, 1);
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
