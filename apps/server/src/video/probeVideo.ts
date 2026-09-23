import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { ProcessRunner } from "../processRunner.ts";
import { MAX_VIDEO_SECONDS, VideoInspectionError, type VideoMetadata } from "./videoInspection.ts";

const ProbeResult = Schema.Struct({
  streams: Schema.Array(
    Schema.Struct({
      codec_type: Schema.String,
      codec_name: Schema.optional(Schema.String),
      width: Schema.optional(Schema.Number),
      height: Schema.optional(Schema.Number),
      avg_frame_rate: Schema.optional(Schema.String),
      duration: Schema.optional(Schema.String),
      side_data_list: Schema.optional(
        Schema.Array(Schema.Struct({ rotation: Schema.optional(Schema.Number) })),
      ),
    }),
  ),
  format: Schema.Struct({
    duration: Schema.optional(Schema.String),
    bit_rate: Schema.optional(Schema.String),
  }),
});

const decodeProbe = Schema.decodeUnknownEffect(Schema.fromJsonString(ProbeResult));

export const runVideoProcess = Effect.fn("video.runProcess")(function* (
  command: string,
  args: string[],
) {
  const runner = yield* ProcessRunner;
  const result = yield* runner
    .run({ command, args, timeout: "30 seconds", maxOutputBytes: 128 * 1024 })
    .pipe(
      Effect.mapError(
        (error) =>
          new VideoInspectionError({
            message:
              error._tag === "ProcessSpawnError"
                ? `Could not start ${command}. Install FFmpeg (including ffprobe) on the environment running T3 and ensure both are on PATH.`
                : `${command} failed or exceeded its processing limit (${error._tag}).`,
          }),
      ),
    );
  if (result.code !== 0) {
    return yield* new VideoInspectionError({
      message: `${command} could not decode this video. It may be corrupt, unsupported, or not a standalone video file.`,
    });
  }
  return result;
});

export const probeVideo = Effect.fn("video.probe")(function* (source: string, sizeBytes: number) {
  const result = yield* runVideoProcess("ffprobe", [
    "-v",
    "error",
    "-protocol_whitelist",
    "file",
    "-show_entries",
    "stream=codec_type,codec_name,width,height,avg_frame_rate,duration:stream_side_data=rotation:format=duration,bit_rate",
    "-of",
    "json",
    source,
  ]);
  const probe = yield* decodeProbe(result.stdout).pipe(
    Effect.mapError(
      () => new VideoInspectionError({ message: "ffprobe returned invalid video metadata." }),
    ),
  );
  const video = probe.streams.find((stream) => stream.codec_type === "video");
  const duration = Number(probe.format.duration ?? video?.duration);
  if (!video || !video.width || !video.height || !Number.isFinite(duration) || duration <= 0) {
    return yield* new VideoInspectionError({
      message: "The file has no video stream with a known positive duration and dimensions.",
    });
  }
  if (video.width > 16384 || video.height > 16384) {
    return yield* new VideoInspectionError({
      message:
        "Video dimensions exceed the decoding limit (16384 pixels). Provide a smaller recording.",
    });
  }
  if (duration > MAX_VIDEO_SECONDS) {
    return yield* new VideoInspectionError({
      message: "Video exceeds ten minutes. Trim it to the relevant interval before inspection.",
    });
  }
  const [numerator, denominator] = (video.avg_frame_rate ?? "0/0").split("/").map(Number);
  const fps = numerator! / denominator!;
  const bitrate = Number(probe.format.bit_rate);
  const rotation = video.side_data_list?.find((data) => data.rotation !== undefined)?.rotation ?? 0;
  const rotated = Math.abs(rotation % 180) === 90;
  return {
    durationSeconds: duration,
    width: rotated ? video.height : video.width,
    height: rotated ? video.width : video.height,
    codec: video.codec_name ?? "unknown",
    frameRate: Number.isFinite(fps) && fps > 0 ? fps : null,
    bitrate: Number.isFinite(bitrate) && bitrate > 0 ? bitrate : null,
    hasAudio: probe.streams.some((stream) => stream.codec_type === "audio"),
    sizeBytes,
  } satisfies VideoMetadata;
});
