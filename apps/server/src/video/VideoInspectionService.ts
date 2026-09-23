import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as Semaphore from "effect/Semaphore";
import { ProcessRunner } from "../processRunner.ts";
import { extractVideoFrames } from "./extractVideoFrames.ts";
import { probeVideo } from "./probeVideo.ts";
import {
  MAX_VIDEO_BYTES,
  VIDEO_FRAME_BUDGET,
  VideoInspectionError,
  sampleVideoTimes,
  type VideoInspection as Inspection,
  type VideoInspectInput,
} from "./videoInspection.ts";

export class VideoInspection extends Context.Service<
  VideoInspection,
  {
    readonly inspect: (
      owner: object,
      input: VideoInspectInput,
    ) => Effect.Effect<Inspection, VideoInspectionError>;
  }
>()("t3/video/VideoInspectionService/VideoInspection") {}

export const layer = Layer.effect(
  VideoInspection,
  Effect.gen(function* () {
    const services = yield* Effect.context<FileSystem.FileSystem | Path.Path | ProcessRunner>();
    // The owner is the credential scope object. Revoking it releases its counters for GC.
    const budgets = new WeakMap<object, Map<string, number>>();
    const semaphore = yield* Semaphore.make(2);
    const inspect = Effect.fn("VideoInspection.inspect")(
      function* (owner: object, input: VideoInspectInput) {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        if (!path.isAbsolute(input.source)) {
          return yield* new VideoInspectionError({
            message: "Provide an absolute path to a video on this environment.",
          });
        }
        const source = yield* fs.realPath(input.source);
        const stats = yield* fs.stat(source);
        if (stats.type !== "File" || Number(stats.size) > MAX_VIDEO_BYTES) {
          return yield* new VideoInspectionError({
            message: "Video must be a regular file no larger than 250 MiB.",
          });
        }
        const metadata = yield* probeVideo(source, Number(stats.size));
        const times = yield* Effect.try({
          try: () => sampleVideoTimes(input, metadata.durationSeconds),
          catch: (error) => error as VideoInspectionError,
        });
        const budget = budgets.get(owner) ?? new Map<string, number>();
        budgets.set(owner, budget);
        const used = budget.get(source) ?? 0;
        if (used + times.length > VIDEO_FRAME_BUDGET) {
          return yield* new VideoInspectionError({
            message: `Video frame budget reached: ${VIDEO_FRAME_BUDGET - used} frames remain in this provider session. Reduce frameCount or report the unexamined intervals.`,
          });
        }
        budget.set(source, used + times.length);
        const directory = yield* fs.makeTempDirectoryScoped({ prefix: "t3-video-" });
        const frames = yield* extractVideoFrames(source, directory, times, input, metadata).pipe(
          Effect.onError(() =>
            Effect.sync(() => budget.set(source, (budget.get(source) ?? 0) - times.length)),
          ),
        );
        return {
          metadata,
          frames,
          coverage: {
            startSeconds: input.startSeconds ?? 0,
            endSeconds: input.endSeconds ?? metadata.durationSeconds,
            remainingFrames: VIDEO_FRAME_BUDGET - (budget.get(source) ?? 0),
            note: "Sampled still images only; intervals between timestamps and audio were not examined. Inspect suspicious ranges more densely. Cite timestamps and distinguish observations from inferred causes.",
          },
        } satisfies Inspection;
      },
      Effect.scoped,
      semaphore.withPermits(1),
      Effect.mapError((error) =>
        error._tag === "VideoInspectionError"
          ? error
          : new VideoInspectionError({
              message:
                "Could not read or prepare the video file. Check that it exists and is readable on this environment.",
            }),
      ),
      Effect.provide(services),
    );
    return VideoInspection.of({ inspect });
  }),
);
