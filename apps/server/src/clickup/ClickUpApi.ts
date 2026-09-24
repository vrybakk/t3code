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
const OptionalText = Schema.optional(Schema.NullOr(Schema.String));
export const ApiAttachment = Schema.Struct({
  title: OptionalText,
  name: OptionalText,
  url: Schema.String,
  extension: OptionalText,
  mimetype: OptionalText,
  type: Schema.optional(Schema.NullOr(Schema.Union([Schema.String, Schema.Int]))),
  thumbnail_medium: OptionalText,
  thumbnail_small: OptionalText,
});
export const ApiTask = Schema.Struct({
  id: Schema.String,
  team_id: Schema.String,
  name: Schema.String,
  status: Schema.Struct({ status: Schema.String, color: OptionalText }),
  list: Schema.Struct({ name: Schema.String }),
  description: Schema.optional(Schema.NullOr(Schema.String)),
  markdown_description: Schema.optional(Schema.NullOr(Schema.String)),
  attachments: Schema.optional(Schema.NullOr(Schema.Array(ApiAttachment))),
  tags: Schema.optional(Schema.NullOr(Schema.Array(Schema.Struct({ name: Schema.String })))),
});

export const ApiComment = Schema.Struct({
  id: Schema.Union([Schema.String, Schema.Int]),
  user: ApiUser,
  comment_text: Schema.String,
  date: Schema.optional(Schema.NullOr(Schema.String)),
  reply_count: Schema.optional(Schema.NullOr(Schema.Union([Schema.String, Schema.Number]))),
  assignee: Schema.optional(Schema.NullOr(ApiUser)),
  resolved: Schema.optional(Schema.Boolean),
  comment: Schema.optional(
    Schema.NullOr(
      Schema.Array(
        Schema.Struct({
          attachment: Schema.optional(Schema.NullOr(ApiAttachment)),
          image: Schema.optional(Schema.NullOr(ApiAttachment)),
          video: Schema.optional(Schema.NullOr(ApiAttachment)),
        }),
      ),
    ),
  ),
});

export const normalizeUser = (user: typeof ApiUser.Type) => ({
  id: user.id,
  username: user.username ?? String(user.id),
  avatarUrl: user.profilePicture ?? null,
});

export const normalizeAttachment = (attachment: typeof ApiAttachment.Type) => ({
  name: attachment.title ?? attachment.name ?? "Attachment",
  url: attachment.url,
  mimeType:
    attachment.mimetype ?? (attachment.extension?.includes("/") ? attachment.extension : null),
  extension: attachment.extension?.includes("/")
    ? typeof attachment.type === "string"
      ? attachment.type
      : null
    : (attachment.extension ?? null),
  thumbnailUrl: attachment.thumbnail_medium ?? attachment.thumbnail_small ?? null,
});

export function nullableNumber(value: string | number | null | undefined): number | null {
  if (value === undefined || value === null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export const normalizeTask = (task: typeof ApiTask.Type) => ({
  workspaceId: task.team_id,
  taskId: task.id,
  name: task.name,
  status: task.status.status,
  statusColor: task.status.color ?? null,
  tags: (task.tags ?? []).map((tag) => tag.name),
  listName: task.list.name,
  description: task.markdown_description ?? task.description ?? "",
});

export class ClickUpApi extends Context.Service<
  ClickUpApi,
  {
    readonly request: (
      path: string,
      options?: {
        token?: string;
        method?: "GET" | "POST" | "PUT" | "DELETE";
        body?: Record<string, string | number | boolean | null>;
      },
    ) => Effect.Effect<unknown, ClickUpError>;
  }
>()("t3/clickup/ClickUpApi") {}

export const layer = Layer.effect(
  ClickUpApi,
  Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient;
    const request: ClickUpApi["Service"]["request"] = (path, options) =>
      Effect.gen(function* () {
        let request = HttpClientRequest.make(options?.method ?? (options?.body ? "POST" : "GET"))(
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
        if (response.status === 204) return null;
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
