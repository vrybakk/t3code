import {
  AuthAccessWriteScope,
  type AuthSessionId,
  ClickUpError,
  type ClickUpConnection as Connection,
} from "@t3tools/contracts";
import * as Clock from "effect/Clock";
import * as Config from "effect/Config";
import * as Context from "effect/Context";
import * as Crypto from "effect/Crypto";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Redacted from "effect/Redacted";
import * as Schema from "effect/Schema";
import * as Semaphore from "effect/Semaphore";
import { ServerSecretStore } from "../auth/ServerSecretStore.ts";
import { SessionStore } from "../auth/SessionStore.ts";
import { ApiUser, ApiWorkspace, ClickUpApi, decodeResponse } from "./ClickUpApi.ts";

const Token = Schema.Struct({ access_token: Schema.String });
const SECRET_NAME = "clickup-access-token";
const failure = (message: string) => new ClickUpError({ message });

export class ClickUpConnection extends Context.Service<
  ClickUpConnection,
  {
    readonly status: Effect.Effect<Connection, ClickUpError>;
    readonly account: Effect.Effect<{ token: string; connection: Connection }, ClickUpError>;
    readonly begin: (
      sessionId: AuthSessionId,
      returnToApp?: boolean,
    ) => Effect.Effect<{ url: string }, ClickUpError>;
    readonly complete: (
      state: string,
      code: string | null,
    ) => Effect.Effect<{ returnToApp: boolean }, ClickUpError>;
    readonly disconnect: Effect.Effect<void, ClickUpError>;
  }
>()("t3/clickup/ClickUpConnection") {}

export const layer = Layer.effect(
  ClickUpConnection,
  Effect.gen(function* () {
    const secrets = yield* ServerSecretStore;
    const sessions = yield* SessionStore;
    const api = yield* ClickUpApi;
    const crypto = yield* Crypto.Crypto;
    const clientId = yield* Config.String("T3CODE_CLICKUP_CLIENT_ID").pipe(Config.withDefault(""));
    const clientSecret = yield* Config.Redacted("T3CODE_CLICKUP_CLIENT_SECRET").pipe(
      Config.withDefault(Redacted.make("")),
    );
    const redirectUri = yield* Config.String("T3CODE_CLICKUP_REDIRECT_URI").pipe(
      Config.withDefault(""),
    );
    const configured = Boolean(clientId && Redacted.value(clientSecret) && redirectUri);
    const gate = yield* Semaphore.make(1);
    let pending: {
      state: string;
      sessionId: AuthSessionId;
      expiresAt: number;
      returnToApp: boolean;
    } | null = null;

    const readToken = secrets.get(SECRET_NAME).pipe(
      Effect.map((value) => Option.map(value, (bytes) => new TextDecoder().decode(bytes))),
      Effect.mapError(() => failure("Could not read the saved ClickUp connection.")),
    );
    const token = readToken.pipe(
      Effect.flatMap(
        Option.match({
          onNone: () => Effect.fail(failure("Connect your ClickUp account first.")),
          onSome: Effect.succeed,
        }),
      ),
    );
    const readAccount = Effect.fn("ClickUpConnection.readAccount")(function* (accessToken: string) {
      const user = yield* api
        .request("user", { token: accessToken })
        .pipe(Effect.flatMap(decodeResponse(Schema.Struct({ user: ApiUser }))));
      const teams = yield* api
        .request("team", { token: accessToken })
        .pipe(Effect.flatMap(decodeResponse(Schema.Struct({ teams: Schema.Array(ApiWorkspace) }))));
      return {
        configured,
        user: {
          id: user.user.id,
          username: user.user.username ?? String(user.user.id),
          avatarUrl: user.user.profilePicture ?? null,
        },
        workspaces: teams.teams,
      };
    });

    const status = readToken.pipe(
      Effect.flatMap(
        Option.match({
          onNone: () => Effect.succeed<Connection>({ configured, user: null, workspaces: [] }),
          onSome: readAccount,
        }),
      ),
    );

    const account = token.pipe(
      Effect.flatMap((token) =>
        readAccount(token).pipe(Effect.map((connection) => ({ token, connection }))),
      ),
    );
    const verifyInitiator = Effect.fn("ClickUpConnection.verifyInitiator")(function* (
      sessionId: AuthSessionId,
    ) {
      const active = yield* sessions
        .listActive()
        .pipe(Effect.mapError(() => failure("Could not verify the client that started sign-in.")));
      const now = yield* Clock.currentTimeMillis;
      if (
        !active.some(
          (session) =>
            session.sessionId === sessionId &&
            DateTime.toEpochMillis(session.expiresAt) > now &&
            session.scopes.includes(AuthAccessWriteScope),
        )
      ) {
        return yield* failure(
          "The client that started ClickUp sign-in no longer has permission. Start again in Nerd.",
        );
      }
    });

    const begin = Effect.fn("ClickUpConnection.begin")(function* (
      sessionId: AuthSessionId,
      returnToApp = false,
    ) {
      if (!configured)
        return yield* failure("ClickUp OAuth is not configured on this environment.");
      const state = yield* crypto.randomUUIDv4.pipe(
        Effect.mapError(() => failure("Could not start ClickUp authorization.")),
      );
      const now = yield* Clock.currentTimeMillis;
      pending = { state, sessionId, expiresAt: now + 10 * 60_000, returnToApp };
      const url = new URL("https://app.clickup.com/api");
      url.searchParams.set("client_id", clientId);
      url.searchParams.set("redirect_uri", redirectUri);
      url.searchParams.set("state", state);
      return { url: url.toString() };
    });

    const complete = Effect.fn("ClickUpConnection.complete")(function* (
      state: string,
      code: string | null,
    ) {
      const flow = pending;
      const now = yield* Clock.currentTimeMillis;
      if (!flow || flow.state !== state || flow.expiresAt <= now)
        return yield* failure(
          "This ClickUp sign-in has expired or was already used. Start again in Nerd.",
        );
      pending = null;
      if (!code) return yield* failure("ClickUp sign-in was cancelled. You can try again in Nerd.");
      yield* verifyInitiator(flow.sessionId);
      const result = yield* api
        .request("oauth/token", {
          body: { client_id: clientId, client_secret: Redacted.value(clientSecret), code },
        })
        .pipe(Effect.flatMap(decodeResponse(Token)));
      yield* readAccount(result.access_token);
      yield* verifyInitiator(flow.sessionId);
      yield* secrets
        .set(SECRET_NAME, new TextEncoder().encode(result.access_token))
        .pipe(Effect.mapError(() => failure("Could not save the ClickUp connection.")));
      return { returnToApp: flow.returnToApp };
    });

    const disconnect = Effect.gen(function* () {
      pending = null;
      yield* secrets
        .remove(SECRET_NAME)
        .pipe(Effect.mapError(() => failure("Could not remove the ClickUp connection.")));
    });
    return ClickUpConnection.of({
      status,
      account,
      begin: (id, returnToApp) => begin(id, returnToApp).pipe(gate.withPermit),
      complete: (state, code) => complete(state, code).pipe(gate.withPermit),
      disconnect: disconnect.pipe(gate.withPermit),
    });
  }),
);
