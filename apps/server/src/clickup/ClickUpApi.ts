import { ClickUpError } from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import { HttpClient, HttpClientRequest } from "effect/unstable/http";

export const ApiUser = Schema.Struct({
  id: Schema.Int,
  username: Schema.NullOr(Schema.String),
  profilePicture: Schema.optional(Schema.NullOr(Schema.String)),
});
export const ApiWorkspace = Schema.Struct({ id: Schema.String, name: Schema.String });
export const ApiTask = Schema.Struct({
  id: Schema.String,
  team_id: Schema.String,
  name: Schema.String,
  status: Schema.Struct({ status: Schema.String }),
  list: Schema.Struct({ name: Schema.String }),
  description: Schema.optional(Schema.NullOr(Schema.String)),
  markdown_description: Schema.optional(Schema.NullOr(Schema.String)),
  attachments: Schema.optional(
    Schema.Array(
      Schema.Struct({
        title: Schema.optional(Schema.String),
        url: Schema.String,
      }),
    ),
  ),
});

export const ApiComment = Schema.Struct({
  id: Schema.Union([Schema.String, Schema.Int]),
  user: ApiUser,
  comment_text: Schema.String,
});

export const normalizeTask = (task: typeof ApiTask.Type) => ({
  workspaceId: task.team_id,
  taskId: task.id,
  name: task.name,
  status: task.status.status,
  listName: task.list.name,
  description: task.markdown_description ?? task.description ?? "",
});

export class ClickUpApi extends Context.Service<
  ClickUpApi,
  {
    readonly request: (
      path: string,
      options?: { token?: string; body?: Record<string, string> },
    ) => Effect.Effect<unknown, ClickUpError>;
  }
>()("t3/clickup/ClickUpApi") {}

export const layer = Layer.effect(
  ClickUpApi,
  Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient;
    const request: ClickUpApi["Service"]["request"] = (path, options) =>
      Effect.gen(function* () {
        let request = HttpClientRequest.make(options?.body ? "POST" : "GET")(
          `https://api.clickup.com/api/v2/${path}`,
        );
        if (options?.token)
          request = HttpClientRequest.setHeader(
            request,
            "Authorization",
            `Bearer ${options.token}`,
          );
        if (options?.body) request = HttpClientRequest.bodyJsonUnsafe(request, options.body);
        const response = yield* client.execute(request).pipe(
          Effect.mapError(
            () =>
              new ClickUpError({
                message: "Could not reach ClickUp. Check your connection and try again.",
              }),
          ),
        );
        if (response.status < 200 || response.status >= 300) {
          const message =
            response.status === 401
              ? "ClickUp authorization expired or was revoked. Reconnect your account."
              : response.status === 429
                ? "ClickUp rate limit reached. Wait before refreshing."
                : response.status === 403
                  ? "Your ClickUp account does not have access to this resource."
                  : `ClickUp request failed (${response.status}). Try again.`;
          return yield* new ClickUpError({ message });
        }
        return yield* response.json.pipe(
          Effect.mapError(
            () => new ClickUpError({ message: "ClickUp returned an unexpected response." }),
          ),
        );
      }).pipe(
        Effect.timeout("20 seconds"),
        Effect.catchTag("TimeoutError", () =>
          Effect.fail(new ClickUpError({ message: "ClickUp did not respond in time. Try again." })),
        ),
      );
    return ClickUpApi.of({ request });
  }),
);

export const decodeResponse =
  <A>(schema: Schema.Codec<A>) =>
  (value: unknown) =>
    Schema.decodeUnknownEffect(schema)(value).pipe(
      Effect.mapError(
        () => new ClickUpError({ message: "ClickUp returned an unexpected response." }),
      ),
    );
