// @effect-diagnostics nodeBuiltinImport:off - Node owns the temporary OAuth loopback listener.
import * as NodeHttp from "node:http";
import { ClickUpError } from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { ServerConfig } from "../config.ts";

export class ClickUpCallbackListener extends Context.Service<
  ClickUpCallbackListener,
  {
    readonly start: (
      redirectUri: string,
      state: string,
      complete: (state: string, code: string | null) => Effect.Effect<unknown, ClickUpError>,
    ) => Effect.Effect<void, ClickUpError>;
    readonly stop: Effect.Effect<void>;
  }
>()("t3/clickup/ClickUpCallbackListener") {}

export const layer = Layer.effect(
  ClickUpCallbackListener,
  Effect.gen(function* () {
    const config = yield* ServerConfig;
    let active: { server: NodeHttp.Server; timer: ReturnType<typeof setTimeout> } | undefined;

    const close = (server: NodeHttp.Server) => {
      if (active?.server === server) {
        clearTimeout(active.timer);
        active = undefined;
      }
      server.close();
      server.closeAllConnections();
    };
    const stop = Effect.sync(() => {
      if (active) close(active.server);
    });
    yield* Effect.addFinalizer(() => stop);

    const start = Effect.fn("ClickUpCallbackListener.start")(function* (
      redirectUri: string,
      state: string,
      complete: (state: string, code: string | null) => Effect.Effect<unknown, ClickUpError>,
    ) {
      yield* stop;
      if (config.mode !== "desktop") return;
      const url = new URL(redirectUri);
      if (url.protocol !== "http:" || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) {
        return yield* new ClickUpError({
          message: "For the Mac app, use an HTTP localhost ClickUp redirect URL.",
        });
      }
      const port = Number(url.port || "80");
      if (port === config.port) return;
      const context = yield* Effect.context<never>();
      const server = NodeHttp.createServer((request, response) => {
        response.setHeader("cache-control", "no-store");
        response.setHeader("referrer-policy", "no-referrer");
        response.setHeader("content-type", "text/plain; charset=utf-8");
        let callback: URL;
        try {
          callback = new URL(request.url ?? "/", redirectUri);
        } catch {
          response.writeHead(400).end("Invalid callback URL.");
          return;
        }
        if (request.method !== "GET" || callback.pathname !== url.pathname) {
          response.writeHead(404).end("Not found.");
          return;
        }
        if (callback.searchParams.get("state") !== state) {
          response.writeHead(400).end("Invalid ClickUp sign-in. Start again in Nerd.");
          return;
        }
        // Close only after the response is flushed, so shutdown cannot cancel the callback.
        response.once("finish", () => close(server));
        void Effect.runPromise(
          complete(state, callback.searchParams.get("code")).pipe(
            Effect.match({
              onSuccess: () => {
                response.end("ClickUp connected. You can close this tab and return to Nerd.");
              },
              onFailure: (error) => {
                response.writeHead(400).end(error.message);
              },
            }),
            Effect.provide(context),
          ),
        ).catch(() => {
          response.writeHead(500).end("Could not complete ClickUp sign-in. Try again in Nerd.");
        });
      });
      yield* Effect.callback<void, ClickUpError>((resume, signal) => {
        server.once("error", () => {
          close(server);
          resume(
            Effect.fail(
              new ClickUpError({
                message: `Could not open ClickUp callback port ${port}. Close the app or dev server using this port, then try again.`,
              }),
            ),
          );
        });
        server.listen(
          { port, host: url.hostname === "[::1]" ? "::1" : "127.0.0.1", signal },
          () => {
            // The native listener owns an unref timer so expiry cannot keep the server process alive.
            // @effect-diagnostics-next-line globalTimers:off
            const timer = setTimeout(() => close(server), 10 * 60_000);
            timer.unref();
            active = { server, timer };
            resume(Effect.void);
          },
        );
        return Effect.sync(() => {
          if (!server.listening) close(server);
        });
      });
    });
    return ClickUpCallbackListener.of({ start, stop });
  }),
);
