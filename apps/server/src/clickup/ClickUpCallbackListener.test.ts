// @effect-diagnostics nodeBuiltinImport:off - Tests exercise the actual loopback listener boundary.
import * as NodeHttp from "node:http";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import { ClickUpError } from "@t3tools/contracts";
import { vi } from "vite-plus/test";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import { ServerConfig, layerTest } from "../config.ts";
import { ClickUpCallbackListener, layer } from "./ClickUpCallbackListener.ts";

const callbackPath = "/api/integrations/clickup/callback";
const callbackUrl = (port: number) => `http://localhost:${port}${callbackPath}`;

function listen(server: NodeHttp.Server, port = 0): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      server.removeListener("error", reject);
      const address = server.address();
      if (!address || typeof address === "string") return reject(new Error("No TCP address"));
      resolve(address.port);
    });
  });
}

function close(server: NodeHttp.Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
    server.closeAllConnections();
  });
}

async function availablePort(): Promise<number> {
  const reservation = NodeHttp.createServer();
  const port = await listen(reservation);
  await close(reservation);
  return port;
}

function request(url: string, method = "GET", path?: string) {
  return new Promise<{ status: number; text: string; headers: NodeHttp.IncomingHttpHeaders }>(
    (resolve, reject) => {
      const outgoing = NodeHttp.request(
        url,
        { method, agent: false, ...(path ? { path } : {}) },
        (response) => {
          let text = "";
          response.setEncoding("utf8");
          response.on("data", (chunk: string) => {
            text += chunk;
          });
          response.once("error", reject);
          response.once("end", () =>
            resolve({ status: response.statusCode ?? 0, text, headers: response.headers }),
          );
        },
      );
      outgoing.once("error", reject);
      outgoing.end();
    },
  );
}

const listenerLayer = (mode: "desktop" | "web" = "desktop", port = 0) =>
  layer.pipe(
    Layer.provide(
      Layer.effect(
        ServerConfig,
        Effect.map(ServerConfig, (config) => ({ ...config, mode, port })),
      ).pipe(
        Layer.provide(layerTest(process.cwd(), { prefix: "clickup-callback-test-" })),
        Layer.provide(NodeServices.layer),
      ),
    ),
  );

it.effect("rejects foreign paths, methods and states without consuming the pending callback", () =>
  Effect.gen(function* () {
    const listener = yield* ClickUpCallbackListener;
    const port = yield* Effect.promise(availablePort);
    const calls: Array<{ state: string; code: string | null }> = [];
    yield* listener.start(callbackUrl(port), "owned-state", (state, code) =>
      Effect.sync(() => calls.push({ state, code })),
    );
    for (const [url, method, status] of [
      [`http://127.0.0.1:${port}/other?state=owned-state`, "GET", 404],
      [`${callbackUrl(port)}?state=owned-state`, "POST", 404],
      [`${callbackUrl(port)}?state=foreign-state&code=secret`, "GET", 400],
    ] as const) {
      const response = yield* Effect.promise(() => request(url, method));
      assert.equal(response.status, status);
      assert.notInclude(response.text, "secret");
      assert.equal(response.headers["cache-control"], "no-store");
      assert.equal(response.headers["referrer-policy"], "no-referrer");
    }
    assert.deepEqual(calls, []);
    const malformed = yield* Effect.promise(() =>
      request(callbackUrl(port), "GET", "http://[invalid"),
    );
    assert.equal(malformed.status, 400);
    assert.deepEqual(calls, []);
    const success = yield* Effect.promise(() =>
      request(`${callbackUrl(port)}?state=owned-state&code=valid-code`),
    );
    assert.equal(success.status, 200);
    assert.include(success.text, "ClickUp connected");
    assert.deepEqual(calls, [{ state: "owned-state", code: "valid-code" }]);
    yield* Effect.promise(async () => {
      const replacement = NodeHttp.createServer();
      await listen(replacement, port);
      await close(replacement);
    });
  }).pipe(Effect.provide(listenerLayer())),
);

it.effect("returns completion errors and cancellation responses before releasing the port", () =>
  Effect.gen(function* () {
    const listener = yield* ClickUpCallbackListener;
    const port = yield* Effect.promise(availablePort);
    for (const suffix of ["&code=denied-code", ""]) {
      let receivedCode: string | null | undefined;
      yield* listener.start(callbackUrl(port), "owned-state", (_state, code) => {
        receivedCode = code;
        return Effect.fail(new ClickUpError({ message: "Sign-in was cancelled." }));
      });
      const response = yield* Effect.promise(() =>
        request(`${callbackUrl(port)}?state=owned-state${suffix}`),
      );
      assert.equal(response.status, 400);
      assert.equal(response.text, "Sign-in was cancelled.");
      assert.equal(receivedCode, suffix ? "denied-code" : null);
    }
  }).pipe(Effect.provide(listenerLayer())),
);

it.effect("reports an occupied port without disturbing its owner", () =>
  Effect.acquireUseRelease(
    Effect.promise(async () => {
      const server = NodeHttp.createServer((_request, response) => response.end("other owner"));
      return { server, port: await listen(server) };
    }),
    ({ port }) =>
      Effect.gen(function* () {
        const listener = yield* ClickUpCallbackListener;
        const error = yield* Effect.flip(
          listener.start(callbackUrl(port), "state", () => Effect.void),
        );
        assert.include(error.message, `port ${port}`);
        const response = yield* Effect.promise(() => request(callbackUrl(port)));
        assert.equal(response.text, "other owner");
      }),
    ({ server }) => Effect.promise(() => close(server)),
  ).pipe(Effect.provide(listenerLayer())),
);

it.effect("leaves web callbacks and the existing desktop backend listener untouched", () =>
  Effect.acquireUseRelease(
    Effect.promise(async () => {
      const server = NodeHttp.createServer((_request, response) => response.end("main backend"));
      return { server, port: await listen(server) };
    }),
    ({ port }) =>
      Effect.gen(function* () {
        for (const mode of ["desktop", "web"] as const) {
          yield* Effect.gen(function* () {
            const listener = yield* ClickUpCallbackListener;
            yield* listener.start(callbackUrl(port), "state", () => Effect.void);
            yield* listener.stop;
          }).pipe(Effect.provide(listenerLayer(mode, mode === "desktop" ? port : 0)));
          const response = yield* Effect.promise(() => request(callbackUrl(port)));
          assert.equal(response.text, "main backend");
        }
      }),
    ({ server }) => Effect.promise(() => close(server)),
  ),
);

it.effect("replaces the pending state and releases the listener on stop and scope exit", () =>
  Effect.gen(function* () {
    const port = yield* Effect.promise(availablePort);
    yield* Effect.gen(function* () {
      const listener = yield* ClickUpCallbackListener;
      yield* listener.start(callbackUrl(port), "old-state", () => Effect.void);
      yield* listener.start(callbackUrl(port), "new-state", () => Effect.void);
      const old = yield* Effect.promise(() => request(`${callbackUrl(port)}?state=old-state`));
      assert.equal(old.status, 400);
      yield* listener.stop;
      yield* listener.start(callbackUrl(port), "final-state", () => Effect.void);
    }).pipe(Effect.provide(listenerLayer()));
    yield* Effect.promise(async () => {
      const replacement = NodeHttp.createServer();
      await listen(replacement, port);
      await close(replacement);
    });
  }),
);

it.effect("rejects non-loopback desktop callbacks", () =>
  Effect.gen(function* () {
    const listener = yield* ClickUpCallbackListener;
    for (const url of ["https://localhost:6326/callback", "http://example.com:6326/callback"]) {
      const error = yield* Effect.flip(listener.start(url, "state", () => Effect.void));
      assert.include(error.message, "HTTP localhost");
    }
  }).pipe(Effect.provide(listenerLayer())),
);

it.effect("expires the pending callback after ten minutes and releases its port", () =>
  Effect.acquireUseRelease(
    Effect.sync(() => vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })),
    () =>
      Effect.gen(function* () {
        const listener = yield* ClickUpCallbackListener;
        const port = yield* Effect.promise(availablePort);
        yield* listener.start(callbackUrl(port), "state", () => Effect.void);
        vi.advanceTimersByTime(10 * 60_000 - 1);
        const beforeExpiry = yield* Effect.promise(() => request(callbackUrl(port)));
        assert.equal(beforeExpiry.status, 400);
        vi.advanceTimersByTime(1);
        yield* Effect.promise(async () => {
          const replacement = NodeHttp.createServer();
          await listen(replacement, port);
          await close(replacement);
        });
      }).pipe(Effect.provide(listenerLayer())),
    () => Effect.sync(() => vi.useRealTimers()),
  ),
);

it.effect("does not leave a listener behind when startup is interrupted", () =>
  Effect.gen(function* () {
    const listener = yield* ClickUpCallbackListener;
    const port = yield* Effect.promise(availablePort);
    const started = yield* listener
      .start(callbackUrl(port), "state", () => Effect.void)
      .pipe(Effect.forkChild({ startImmediately: true }));
    yield* Fiber.interrupt(started);
    yield* Effect.promise(async () => {
      const replacement = NodeHttp.createServer();
      await listen(replacement, port);
      await close(replacement);
    });
  }).pipe(Effect.provide(listenerLayer())),
);
