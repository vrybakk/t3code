import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Stream from "effect/Stream";
import { HttpClient } from "effect/unstable/http";
import { MAX_VIDEO_BYTES, VideoInspectionError } from "./videoInspection.ts";

export const downloadVideo = Effect.fn("video.download")(
  function* (source: string, destination: string) {
    const url = yield* Effect.try({
      try: () => new URL(source),
      catch: () => new VideoInspectionError({ message: "Invalid video URL." }),
    });
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
      return yield* new VideoInspectionError({
        message:
          "Use a downloadable HTTP(S) URL without embedded credentials, or download the video with the existing task connector.",
      });
    }
    const client = yield* HttpClient.HttpClient;
    const fs = yield* FileSystem.FileSystem;
    const response = yield* client.get(url.href);
    if (response.status < 200 || response.status >= 300) {
      return yield* new VideoInspectionError({
        message: `Video download returned HTTP ${response.status}. Retrieve authenticated attachments with the existing task connector or provide a downloadable copy.`,
      });
    }
    if (response.headers["content-type"]?.includes("text/html")) {
      return yield* new VideoInspectionError({
        message:
          "This URL returned a webpage, not a downloadable video. Use the task connector or provide the video file.",
      });
    }
    if (Number(response.headers["content-length"]) > MAX_VIDEO_BYTES) {
      return yield* new VideoInspectionError({ message: "Video download exceeds 250 MiB." });
    }
    let received = 0;
    yield* response.stream.pipe(
      Stream.mapEffect((chunk) => {
        received += chunk.byteLength;
        return received > MAX_VIDEO_BYTES
          ? Effect.fail(new VideoInspectionError({ message: "Video download exceeds 250 MiB." }))
          : Effect.succeed(chunk);
      }),
      Stream.run(fs.sink(destination)),
    );
    if (received === 0)
      return yield* new VideoInspectionError({ message: "The video download was empty." });
  },
  Effect.timeout("2 minutes"),
  Effect.mapError((error) =>
    error._tag === "VideoInspectionError"
      ? error
      : new VideoInspectionError({
          message:
            "Video download failed or timed out. Check access with the existing task connector or provide a downloadable copy.",
        }),
  ),
);
