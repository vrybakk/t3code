import {
  ClickUpError,
  type ClickUpOAuthConfig,
  type ClickUpSaveOAuthConfigInput,
} from "@t3tools/contracts";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Redacted from "effect/Redacted";
import * as Schema from "effect/Schema";
import { ServerSecretStore } from "../auth/ServerSecretStore.ts";

export const DEFAULT_CLICKUP_REDIRECT_URI =
  "http://localhost:6326/api/integrations/clickup/callback";
const SECRET_NAME = "clickup-oauth-config";
const Credentials = Schema.Struct({
  clientId: Schema.String,
  clientSecret: Schema.String,
  redirectUri: Schema.String,
});
const decodeCredentials = Schema.decodeEffect(Schema.fromJsonString(Credentials));
const encodeCredentials = Schema.encodeSync(Schema.fromJsonString(Credentials));
const failure = (message: string) => new ClickUpError({ message });

export function isValidClickUpRedirectUri(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      (url.protocol === "https:" ||
        (url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))) &&
      url.pathname === "/api/integrations/clickup/callback" &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash
    );
  } catch {
    return false;
  }
}

export const makeOAuthConfig = Effect.gen(function* () {
  const secrets = yield* ServerSecretStore;
  const clientId = yield* Config.String("T3CODE_CLICKUP_CLIENT_ID").pipe(Config.withDefault(""));
  const secret = yield* Config.Redacted("T3CODE_CLICKUP_CLIENT_SECRET").pipe(
    Config.withDefault(Redacted.make("")),
  );
  const redirectUri = yield* Config.String("T3CODE_CLICKUP_REDIRECT_URI").pipe(
    Config.withDefault(""),
  );
  const environment = {
    clientId,
    clientSecret: Redacted.value(secret),
    redirectUri,
    source:
      clientId && Redacted.value(secret) && redirectUri
        ? ("environment" as const)
        : ("none" as const),
  };
  const read = Effect.gen(function* () {
    const saved = yield* secrets
      .get(SECRET_NAME)
      .pipe(
        Effect.mapError(() => failure("Could not read the saved ClickUp OAuth configuration.")),
      );
    if (Option.isSome(saved)) {
      const credentials = yield* decodeCredentials(new TextDecoder().decode(saved.value)).pipe(
        Effect.mapError(() => failure("The saved ClickUp OAuth configuration is invalid.")),
      );
      return { ...credentials, source: "saved" as const };
    }
    return environment;
  });
  const toMetadata = (
    config: typeof Credentials.Type & { source: ClickUpOAuthConfig["source"] },
  ): ClickUpOAuthConfig => ({
    clientId: config.clientId,
    redirectUri: config.redirectUri || DEFAULT_CLICKUP_REDIRECT_URI,
    hasClientSecret: Boolean(config.clientSecret),
    source: config.source,
  });
  const metadata = read.pipe(Effect.map(toMetadata));
  const save = Effect.fn("ClickUpOAuthConfig.save")(function* (input: ClickUpSaveOAuthConfigInput) {
    const previous = yield* read;
    const clientId = input.clientId.trim();
    const redirectUri = input.redirectUri.trim();
    const clientSecret =
      input.clientSecret?.trim() || (previous.clientId === clientId ? previous.clientSecret : "");
    if (!clientId || clientId.length > 512 || !clientSecret || clientSecret.length > 4096)
      return yield* failure(
        "Provide the ClickUp Client ID and Client Secret. A changed Client ID requires its secret.",
      );
    if (redirectUri.length > 2048 || !isValidClickUpRedirectUri(redirectUri))
      return yield* failure(
        "Use an HTTPS or local HTTP URL ending in /api/integrations/clickup/callback, without query parameters.",
      );
    yield* secrets
      .set(
        SECRET_NAME,
        new TextEncoder().encode(encodeCredentials({ clientId, clientSecret, redirectUri })),
      )
      .pipe(Effect.mapError(() => failure("Could not save the ClickUp OAuth configuration.")));
    return toMetadata({ clientId, clientSecret, redirectUri, source: "saved" });
  });
  const clear = secrets.remove(SECRET_NAME).pipe(
    Effect.mapError(() => failure("Could not remove the ClickUp OAuth configuration.")),
    Effect.as(toMetadata(environment)),
  );
  return { read, metadata, save, clear };
});
