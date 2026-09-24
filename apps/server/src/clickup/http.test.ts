import { assert, it } from "@effect/vitest";
import { EnvironmentId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { HttpRouter } from "effect/unstable/http";
import { ServerEnvironment } from "../environment/ServerEnvironment.ts";
import { ClickUpConnection } from "./ClickUpConnection.ts";
import { callbackLayer } from "./http.ts";

it.effect("returns web sign-in to its environment and leaves desktop sign-in in the browser", () =>
  Effect.gen(function* () {
    for (const returnToApp of [true, false]) {
      const routes = callbackLayer.pipe(
        Layer.provide(
          Layer.mock(ClickUpConnection)({ complete: () => Effect.succeed({ returnToApp }) }),
        ),
        Layer.provide(
          Layer.mock(ServerEnvironment)({
            getEnvironmentId: Effect.succeed(EnvironmentId.make("test-environment")),
          }),
        ),
      );
      yield* Effect.acquireUseRelease(
        Effect.sync(() => HttpRouter.toWebHandler(routes, { disableLogger: true })),
        ({ handler }) =>
          Effect.promise(async () => {
            const response = await handler(
              new Request(
                "http://localhost/api/integrations/clickup/callback?state=fixture&code=fixture",
              ),
            );
            assert.equal(response.headers.get("cache-control"), "no-store");
            assert.equal(response.headers.get("referrer-policy"), "no-referrer");
            if (returnToApp) {
              assert.equal(response.status, 302);
              assert.equal(
                response.headers.get("location"),
                "/settings/integrations?machine=test-environment",
              );
            } else {
              assert.equal(response.status, 200);
              assert.include(await response.text(), "close this tab and return to Nerd");
            }
          }),
        ({ dispose }) => Effect.promise(dispose),
      );
    }
  }),
);
