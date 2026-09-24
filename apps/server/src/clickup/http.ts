import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import {
  HttpMiddleware,
  HttpRouter,
  HttpServerRequest,
  HttpServerResponse,
} from "effect/unstable/http";
import { ServerEnvironment } from "../environment/ServerEnvironment.ts";
import { ClickUpConnection } from "./ClickUpConnection.ts";

export const callbackLayer = Layer.unwrap(
  Effect.gen(function* () {
    const connection = yield* ClickUpConnection;
    const environment = yield* ServerEnvironment;
    return HttpRouter.add(
      "GET",
      "/api/integrations/clickup/callback",
      Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest;
        const url = new URL(request.url, "http://localhost");
        return yield* connection
          .complete(url.searchParams.get("state") ?? "", url.searchParams.get("code"))
          .pipe(
            Effect.flatMap(({ returnToApp }) => {
              const headers = { "cache-control": "no-store", "referrer-policy": "no-referrer" };
              return returnToApp
                ? environment.getEnvironmentId.pipe(
                    Effect.map((id) =>
                      HttpServerResponse.redirect(
                        `/settings/integrations?machine=${encodeURIComponent(id)}`,
                        { headers },
                      ),
                    ),
                  )
                : Effect.succeed(
                    HttpServerResponse.text(
                      "ClickUp connected. You can close this tab and return to Nerd.",
                      { headers },
                    ),
                  );
            }),
            Effect.catchTag("ClickUpError", (error) =>
              Effect.succeed(
                HttpServerResponse.text(error.message, {
                  status: 400,
                  headers: { "cache-control": "no-store", "referrer-policy": "no-referrer" },
                }),
              ),
            ),
          );
      }).pipe(HttpMiddleware.withLoggerDisabled),
    );
  }),
);
