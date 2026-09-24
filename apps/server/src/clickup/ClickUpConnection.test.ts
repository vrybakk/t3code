import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import { AuthAccessWriteScope, AuthSessionId, ClickUpError } from "@t3tools/contracts";
import * as ConfigProvider from "effect/ConfigProvider";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as TestClock from "effect/testing/TestClock";
import { SessionStore } from "../auth/SessionStore.ts";
import { SecretStorePersistError, ServerSecretStore } from "../auth/ServerSecretStore.ts";
import { ClickUpCallbackListener } from "./ClickUpCallbackListener.ts";
import { ClickUpApi } from "./ClickUpApi.ts";
import { ClickUpConnection, layer } from "./ClickUpConnection.ts";

const sessionId = AuthSessionId.make("clickup-test-session");

function setup(configured = true, revokeDuringExchange = false, profilePicture?: string | null) {
  const values = new Map<string, Uint8Array>();
  let active = true;
  let failUser = false;
  let failSave = false;
  let expiresAt = DateTime.makeUnsafe("2099-01-01T00:00:00.000Z");
  const calls: string[] = [];
  const testLayer = layer.pipe(
    Layer.provide(
      Layer.succeed(ClickUpCallbackListener, { start: () => Effect.void, stop: Effect.void }),
    ),
    Layer.provide(
      Layer.mock(ServerSecretStore)({
        get: (name) => Effect.sync(() => Option.fromUndefinedOr(values.get(name))),
        set: (name, value) =>
          Effect.suspend(() =>
            failSave
              ? Effect.fail(
                  new SecretStorePersistError({ resource: "fixture", cause: "fixture failure" }),
                )
              : Effect.sync(() => {
                  values.set(name, value);
                }),
          ),
        remove: (name) =>
          Effect.sync(() => {
            values.delete(name);
          }),
      }),
    ),
    Layer.provide(
      Layer.mock(SessionStore)({
        cookieName: "test",
        legacyCookieName: undefined,
        listActive: () =>
          Effect.sync(() =>
            active
              ? [
                  {
                    sessionId,
                    subject: "test",
                    method: "browser-session-cookie",
                    issuedAt: DateTime.makeUnsafe("2026-01-01T00:00:00.000Z"),
                    expiresAt,
                    scopes: [AuthAccessWriteScope],
                    client: { deviceType: "unknown" },
                    lastConnectedAt: null,
                    connected: true,
                    current: true,
                  },
                ]
              : [],
          ),
      }),
    ),
    Layer.provide(
      Layer.succeed(ClickUpApi, {
        request: (path) =>
          Effect.gen(function* () {
            calls.push(path);
            if (path === "user" && failUser) {
              failUser = false;
              return yield* new ClickUpError({ message: "Fixture account read failed." });
            }
            if (path === "oauth/token") {
              if (revokeDuringExchange) active = false;
              return { access_token: "fixture-token" };
            }
            if (path === "user") return { user: { id: 17, username: "Developer", profilePicture } };
            return { teams: [{ id: "42", name: "Studio" }] };
          }),
      }),
    ),
    Layer.provide(
      ConfigProvider.layer(
        ConfigProvider.fromEnv({
          env: configured
            ? {
                T3CODE_CLICKUP_CLIENT_ID: "fixture-client",
                T3CODE_CLICKUP_CLIENT_SECRET: "fixture-secret",
                T3CODE_CLICKUP_REDIRECT_URI:
                  "https://nerd.example.test/api/integrations/clickup/callback",
              }
            : {},
        }),
      ),
    ),
    Layer.provide(NodeServices.layer),
  );
  return {
    layer: testLayer,
    calls,
    failSave: () => {
      failSave = true;
    },
    savedConfig: () => values.get("clickup-oauth-config"),
    revoke: () => {
      active = false;
    },
    expire: () => {
      expiresAt = DateTime.makeUnsafe(-1);
    },
    stored: () => values.get("clickup-access-token"),
    setToken: (token: string) => {
      values.set("clickup-access-token", new TextEncoder().encode(token));
    },
    failNextUser: () => {
      failUser = true;
    },
  };
}

it.effect(
  "reuses account reads briefly, isolates tokens and clears them on disconnect and reconnect",
  () => {
    const test = setup();
    test.setToken("fixture-token");
    return Effect.gen(function* () {
      const connection = yield* ClickUpConnection;
      yield* connection.status;
      yield* connection.account;
      assert.deepEqual(test.calls, ["user", "team"]);
      yield* TestClock.adjust("5 seconds");
      yield* connection.account;
      assert.equal(test.calls.length, 4);
      test.setToken("different-token");
      yield* connection.account;
      assert.equal(test.calls.length, 6);
      yield* connection.disconnect;
      assert.equal((yield* connection.status).user, null);
      test.setToken("different-token");
      yield* connection.account;
      assert.equal(test.calls.length, 8);
      const state = new URL((yield* connection.begin(sessionId)).url).searchParams.get("state")!;
      yield* connection.complete(state, "code");
      yield* connection.account;
      assert.equal(test.calls.length, 13);
    }).pipe(Effect.provide(test.layer));
  },
);

it.effect("does not cache failed account reads", () => {
  const test = setup();
  test.setToken("fixture-token");
  test.failNextUser();
  return Effect.gen(function* () {
    const connection = yield* ClickUpConnection;
    assert.equal((yield* Effect.result(connection.account))._tag, "Failure");
    assert.equal((yield* connection.account).connection.user?.id, 17);
    assert.deepEqual(test.calls, ["user", "user", "team"]);
  }).pipe(Effect.provide(test.layer));
});

it.effect("reports missing configuration without making network requests", () => {
  const test = setup(false);
  return Effect.gen(function* () {
    const connection = yield* ClickUpConnection;
    assert.deepEqual(yield* connection.status, { configured: false, user: null, workspaces: [] });
    assert.equal((yield* Effect.result(connection.begin(sessionId)))._tag, "Failure");
    assert.deepEqual(test.calls, []);
  }).pipe(Effect.provide(test.layer));
});

it.effect(
  "binds sign-in state, connects once, and never exposes the token in account status",
  () => {
    const test = setup();
    return Effect.gen(function* () {
      const connection = yield* ClickUpConnection;
      const { url } = yield* connection.begin(sessionId, true);
      const authorization = new URL(url);
      const state = authorization.searchParams.get("state")!;
      assert.equal(
        authorization.searchParams.get("redirect_uri"),
        "https://nerd.example.test/api/integrations/clickup/callback",
      );
      assert.equal((yield* Effect.result(connection.complete("wrong", "code")))._tag, "Failure");
      assert.deepEqual(test.calls, []);
      assert.deepEqual(yield* connection.complete(state, "code"), { returnToApp: true });
      assert.deepEqual(yield* connection.status, {
        configured: true,
        user: { id: 17, username: "Developer", avatarUrl: null },
        workspaces: [{ id: "42", name: "Studio" }],
      });
      assert.equal((yield* Effect.result(connection.complete(state, "code")))._tag, "Failure");
      assert.equal(test.calls.filter((path) => path === "oauth/token").length, 1);
      yield* connection.disconnect;
      assert.equal(test.stored(), undefined);
      assert.equal((yield* connection.status).user, null);
    }).pipe(Effect.provide(test.layer));
  },
);

it.effect("preserves the account avatar and accepts accounts without a picture", () => {
  return Effect.gen(function* () {
    for (const profilePicture of ["https://clickup.com/avatar.jpg", null]) {
      const test = setup(true, false, profilePicture);
      yield* Effect.gen(function* () {
        const connection = yield* ClickUpConnection;
        const state = new URL((yield* connection.begin(sessionId)).url).searchParams.get("state")!;
        yield* connection.complete(state, "code");
        assert.equal((yield* connection.status).user?.avatarUrl, profilePicture);
      }).pipe(Effect.provide(test.layer));
    }
  });
});

it.effect("rejects expired and cancelled flows before token exchange", () => {
  const test = setup();
  return Effect.gen(function* () {
    const connection = yield* ClickUpConnection;
    const expired = new URL((yield* connection.begin(sessionId)).url).searchParams.get("state")!;
    yield* TestClock.adjust("11 minutes");
    assert.equal((yield* Effect.result(connection.complete(expired, "code")))._tag, "Failure");
    const cancelled = new URL((yield* connection.begin(sessionId)).url).searchParams.get("state")!;
    assert.equal((yield* Effect.result(connection.complete(cancelled, null)))._tag, "Failure");
    assert.equal((yield* Effect.result(connection.complete(cancelled, "code")))._tag, "Failure");
    assert.deepEqual(test.calls, []);
  }).pipe(Effect.provide(test.layer));
});

it.effect("disconnect and revoked initiators cannot complete pending sign-in", () => {
  const test = setup();
  return Effect.gen(function* () {
    const connection = yield* ClickUpConnection;
    const cancelled = new URL((yield* connection.begin(sessionId)).url).searchParams.get("state")!;
    yield* connection.disconnect;
    assert.equal((yield* Effect.result(connection.complete(cancelled, "code")))._tag, "Failure");
    const revoked = new URL((yield* connection.begin(sessionId)).url).searchParams.get("state")!;
    test.revoke();
    assert.equal((yield* Effect.result(connection.complete(revoked, "code")))._tag, "Failure");
    assert.deepEqual(test.calls, []);
  }).pipe(Effect.provide(test.layer));
});

it.effect("rejects an expired connected session and rechecks revocation after exchange", () => {
  const expired = setup();
  const revoked = setup(true, true);
  const complete = Effect.gen(function* () {
    const connection = yield* ClickUpConnection;
    const state = new URL((yield* connection.begin(sessionId)).url).searchParams.get("state")!;
    expired.expire();
    assert.equal((yield* Effect.result(connection.complete(state, "code")))._tag, "Failure");
  });
  return Effect.gen(function* () {
    yield* complete.pipe(Effect.provide(expired.layer));
    assert.deepEqual(expired.calls, []);
    yield* complete.pipe(Effect.provide(revoked.layer));
    assert.equal(revoked.calls.includes("oauth/token"), true);
    assert.equal(revoked.stored(), undefined);
  });
});

const localRedirect = "http://localhost:6326/api/integrations/clickup/callback";
const savedInput = {
  clientId: "saved-client",
  clientSecret: "saved-secret",
  redirectUri: localRedirect,
};

it.effect("persists OAuth settings across service restarts without returning the secret", () => {
  const test = setup(false);
  return Effect.gen(function* () {
    const metadata = yield* Effect.gen(function* () {
      const connection = yield* ClickUpConnection;
      assert.equal((yield* connection.status).configured, false);
      const saved = yield* connection.saveOAuthConfig(savedInput);
      assert.deepEqual(saved, {
        clientId: "saved-client",
        redirectUri: localRedirect,
        hasClientSecret: true,
        source: "saved",
      });
      assert.equal((yield* connection.status).configured, true);
      return saved;
    }).pipe(Effect.provide(test.layer));
    assert.notProperty(metadata, "clientSecret");
    yield* Effect.gen(function* () {
      const connection = yield* ClickUpConnection;
      assert.deepEqual(yield* connection.oauthConfig, metadata);
      const authorization = new URL((yield* connection.begin(sessionId)).url);
      assert.equal(authorization.searchParams.get("client_id"), "saved-client");
      assert.equal(authorization.searchParams.get("redirect_uri"), localRedirect);
      yield* connection.complete(authorization.searchParams.get("state")!, "code");
      yield* connection.disconnect;
      assert.deepEqual(yield* connection.oauthConfig, metadata);
    }).pipe(Effect.provide(test.layer));
  });
});

it.effect(
  "preserves a secret only for the same client and cancels pending sign-in when settings change",
  () => {
    const test = setup();
    return Effect.gen(function* () {
      const connection = yield* ClickUpConnection;
      yield* connection.saveOAuthConfig(savedInput);
      const state = new URL((yield* connection.begin(sessionId)).url).searchParams.get("state")!;
      yield* connection.saveOAuthConfig({ ...savedInput, clientSecret: "" });
      assert.include(new TextDecoder().decode(test.savedConfig()), "saved-secret");
      const changedClient = yield* connection
        .saveOAuthConfig({ clientId: "other", redirectUri: localRedirect })
        .pipe(Effect.flip);
      assert.include(changedClient.message, "requires its secret");
      const expired = yield* connection.complete(state, "code").pipe(Effect.flip);
      assert.include(expired.message, "expired");
      assert.deepEqual(test.calls, []);
      const fallback = yield* connection.clearOAuthConfig;
      assert.equal(fallback.source, "environment");
      assert.equal(fallback.clientId, "fixture-client");
    }).pipe(Effect.provide(test.layer));
  },
);

it.effect("clear cancels pending sign-in and preserves a connected account", () => {
  const test = setup(false);
  test.setToken("already-connected");
  return Effect.gen(function* () {
    const connection = yield* ClickUpConnection;
    yield* connection.saveOAuthConfig(savedInput);
    const state = new URL((yield* connection.begin(sessionId)).url).searchParams.get("state")!;
    assert.equal((yield* connection.status).configured, true);
    const metadata = yield* connection.clearOAuthConfig;
    assert.equal(metadata.source, "none");
    const status = yield* connection.status;
    assert.equal(status.configured, false);
    assert.equal(status.user?.id, 17);
    const error = yield* connection.complete(state, "code").pipe(Effect.flip);
    assert.include(error.message, "expired");
  }).pipe(Effect.provide(test.layer));
});

it.effect("failed configuration writes retain the previous settings and pending sign-in", () => {
  const test = setup();
  return Effect.gen(function* () {
    const connection = yield* ClickUpConnection;
    const state = new URL((yield* connection.begin(sessionId)).url).searchParams.get("state")!;
    test.failSave();
    const error = yield* connection.saveOAuthConfig(savedInput).pipe(Effect.flip);
    assert.equal(error.message, "Could not save the ClickUp OAuth configuration.");
    assert.equal((yield* connection.oauthConfig).source, "environment");
    yield* connection.complete(state, "code").pipe(Effect.flip);
    assert.include(test.calls, "oauth/token");
  }).pipe(Effect.provide(test.layer));
});

it.effect("rejects unsafe or malformed callback addresses before storing credentials", () => {
  const test = setup(false);
  return Effect.gen(function* () {
    const connection = yield* ClickUpConnection;
    for (const redirectUri of [
      "http://example.com/api/integrations/clickup/callback",
      "https://user:password@example.com/api/integrations/clickup/callback",
      localRedirect + "?token=value",
      localRedirect + "#fragment",
      "https://example.com/wrong",
      "invalid",
    ]) {
      const error = yield* connection
        .saveOAuthConfig({ ...savedInput, redirectUri })
        .pipe(Effect.flip);
      assert.include(error.message, "URL");
    }
    assert.isUndefined(test.savedConfig());
  }).pipe(Effect.provide(test.layer));
});
