import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import { McpSchema, McpServer, Tool } from "effect/unstable/ai";
import { McpInvocationContext, requireMcpCapability } from "../../McpInvocationContext.ts";
import { VideoInspection } from "../../../video/VideoInspectionService.ts";
import { VideoInspectInput, VideoInspectionError } from "../../../video/videoInspection.ts";

const decodeInput = Schema.decodeUnknownEffect(VideoInspectInput);
const encodeMetadata = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown));

const tool = Tool.make("video_inspect", {
  description:
    "Inspect a QA video as timestamped images. Start with an overview, then narrow startSeconds/endSeconds around suspected glitches, increase frameCount, or crop small UI details. Returns actual images plus metadata and sampling coverage. Up to ten minutes/250 MiB; 12 frames per call and 96 per video/provider session. Audio is not analyzed. Requires FFmpeg and ffprobe on the T3 environment. Never claim sampled frames cover every event.",
  parameters: VideoInspectInput,
})
  .annotate(Tool.Readonly, true)
  .annotate(Tool.Destructive, false);

export const VideoToolkitRegistrationLive = Layer.effectDiscard(
  Effect.gen(function* () {
    const server = yield* McpServer.McpServer;
    const videos = yield* VideoInspection;
    yield* server.addTool({
      tool: new McpSchema.Tool({
        name: tool.name,
        description: Tool.getDescription(tool),
        inputSchema: Tool.getJsonSchema(tool),
        annotations: {
          title: "Inspect video",
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: false,
          openWorldHint: true,
        },
      }),
      annotations: tool.annotations,
      handle: (payload) =>
        Effect.withFiber((fiber) =>
          Effect.gen(function* () {
            const scope = yield* requireMcpCapability("video").pipe(
              Effect.mapError(
                () =>
                  new VideoInspectionError({
                    message: "Video inspection is available for Codex and Claude sessions.",
                  }),
              ),
            );
            const input = yield* decodeInput(payload).pipe(
              Effect.mapError(
                () =>
                  new VideoInspectionError({
                    message:
                      "Invalid video inspection input. Check source, time range, frameCount (1–12), maxDimension (256–3840), and crop dimensions.",
                  }),
              ),
            );
            const result = yield* videos.inspect(scope, input);
            const metadata = {
              metadata: result.metadata,
              coverage: result.coverage,
              frames: result.frames.map(({ timestampSeconds }) => ({ timestampSeconds })),
            };
            return new McpSchema.CallToolResult({
              isError: false,
              structuredContent: metadata,
              content: [
                { type: "text", text: encodeMetadata(metadata) },
                ...result.frames.flatMap(({ timestampSeconds, data }) => [
                  {
                    type: "text" as const,
                    text: `Video frame at ${timestampSeconds.toFixed(3)} seconds`,
                  },
                  { type: "image" as const, data, mimeType: "image/jpeg" },
                ]),
              ],
            });
          }).pipe(
            Effect.provideService(
              McpInvocationContext,
              Context.getUnsafe(fiber.context, McpInvocationContext),
            ),
            Effect.catchTag("VideoInspectionError", (error) =>
              Effect.succeed(
                new McpSchema.CallToolResult({
                  isError: true,
                  content: [{ type: "text", text: error.message }],
                }),
              ),
            ),
          ),
        ),
    });
  }),
);
