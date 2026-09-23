import * as Schema from "effect/Schema";

export const MAX_VIDEO_BYTES = 250 * 1024 * 1024;
export const MAX_VIDEO_SECONDS = 600;
export const VIDEO_FRAME_BUDGET = 96;
export const MAX_FRAME_BYTES = 512 * 1024;

const Seconds = Schema.Finite.check(Schema.isGreaterThanOrEqualTo(0));
const Pixels = Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 16384 }));

export const VideoInspectInput = Schema.Struct({
  source: Schema.String.check(Schema.isNonEmpty(), Schema.isMaxLength(4096)).annotate({
    description:
      "Absolute video path on this environment, or a downloadable HTTP(S) URL. Use an existing task connector to download authenticated attachments first.",
  }),
  startSeconds: Schema.optional(Seconds),
  endSeconds: Schema.optional(Seconds),
  frameCount: Schema.optional(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 12 }))),
  maxDimension: Schema.optional(
    Schema.Int.check(Schema.isBetween({ minimum: 256, maximum: 3840 })),
  ),
  crop: Schema.optional(
    Schema.Struct({
      x: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
      y: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
      width: Pixels,
      height: Pixels,
    }),
  ),
});
export type VideoInspectInput = typeof VideoInspectInput.Type;

export interface VideoMetadata {
  readonly durationSeconds: number;
  readonly width: number;
  readonly height: number;
  readonly codec: string;
  readonly frameRate: number | null;
  readonly bitrate: number | null;
  readonly hasAudio: boolean;
  readonly sizeBytes: number;
}

export interface VideoInspection {
  readonly metadata: VideoMetadata;
  readonly coverage: {
    readonly startSeconds: number;
    readonly endSeconds: number;
    readonly remainingFrames: number;
    readonly note: string;
  };
  readonly frames: ReadonlyArray<{
    readonly timestampSeconds: number;
    readonly data: Uint8Array;
  }>;
}

export class VideoInspectionError extends Schema.TaggedError<VideoInspectionError>()(
  "VideoInspectionError",
  { message: Schema.String },
) {}

export function sampleVideoTimes(input: VideoInspectInput, duration: number): number[] {
  const start = input.startSeconds ?? 0;
  const end = input.endSeconds ?? duration;
  if (start >= duration || end > duration || end < start) {
    throw new VideoInspectionError({
      message:
        "Choose a time range inside the video duration, with endSeconds at or after startSeconds.",
    });
  }
  const count = start === end ? 1 : (input.frameCount ?? 8);
  // Midpoints avoid seeking past the last decodable frame, including variable-frame-rate clips.
  return Array.from({ length: count }, (_, i) => start + (end - start) * ((i + 0.5) / count));
}
