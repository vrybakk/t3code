import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import { runVideoProcess } from "./probeVideo.ts";
import {
  MAX_FRAME_BYTES,
  VideoInspectionError,
  type VideoInspectInput,
  type VideoMetadata,
} from "./videoInspection.ts";

export const extractVideoFrames = Effect.fn("video.extractFrames")(function* (
  source: string,
  directory: string,
  times: number[],
  input: VideoInspectInput,
  metadata: VideoMetadata,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const crop = input.crop;
  if (crop && (crop.x + crop.width > metadata.width || crop.y + crop.height > metadata.height)) {
    return yield* new VideoInspectionError({
      message: "Crop lies outside the displayed video dimensions.",
    });
  }
  const dimension = input.maxDimension ?? 1600;
  const filters = [
    ...(crop ? [`crop=${crop.width}:${crop.height}:${crop.x}:${crop.y}`] : []),
    `scale=w='min(iw,${dimension})':h='min(ih,${dimension})':force_original_aspect_ratio=decrease`,
    "showinfo",
  ].join(",");
  return yield* Effect.forEach(
    times,
    (time, index) =>
      Effect.gen(function* () {
        const output = path.join(directory, `${index}.jpg`);
        const result = yield* runVideoProcess("ffmpeg", [
          "-nostdin",
          "-hide_banner",
          "-loglevel",
          "info",
          "-threads",
          "1",
          "-protocol_whitelist",
          "file",
          "-ss",
          time.toFixed(6),
          "-i",
          source,
          "-map",
          "0:v:0",
          "-an",
          "-sn",
          "-vf",
          filters,
          "-frames:v",
          "1",
          "-threads",
          "1",
          "-q:v",
          "3",
          "-y",
          output,
        ]);
        const stats = yield* fs.stat(output);
        if (Number(stats.size) > MAX_FRAME_BYTES) {
          return yield* new VideoInspectionError({
            message:
              "An extracted frame exceeds the image budget. Request a smaller maxDimension or crop.",
          });
        }
        const actualOffset = result.stderr.match(/\bn:\s*0\s+pts:.*?pts_time:([-\d.e+]+)/)?.[1];
        if (actualOffset === undefined || !Number.isFinite(Number(actualOffset))) {
          return yield* new VideoInspectionError({
            message: "Could not establish the extracted frame timestamp.",
          });
        }
        return { timestampSeconds: time + Number(actualOffset), data: yield* fs.readFile(output) };
      }),
    { concurrency: 1 },
  );
});
