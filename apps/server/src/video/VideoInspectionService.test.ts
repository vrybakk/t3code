import { expect, it } from "@effect/vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Exit from "effect/Exit";
import * as Deferred from "effect/Deferred";
import * as Fiber from "effect/Fiber";
import * as ChildProcessSpawner from "effect/unstable/process/ChildProcessSpawner";
import { ProcessRunner, ProcessSpawnError } from "../processRunner.ts";
import { VideoInspection, layer } from "./VideoInspectionService.ts";
import { MAX_VIDEO_BYTES, sampleVideoTimes } from "./videoInspection.ts";

const metadata = JSON.stringify({
  streams: [
    { codec_type: "video", codec_name: "h264", width: 1920, height: 1080, avg_frame_rate: "30/1" },
  ],
  format: { duration: "10", bit_rate: "123456" },
});
const processResult = (stdout = "", stderr = "") => ({
  stdout,
  stderr,
  code: ChildProcessSpawner.ExitCode(0),
  timedOut: false,
  stdoutTruncated: false,
  stderrTruncated: false,
  stdoutInvalidUtf8: false,
  stderrInvalidUtf8: false,
});

const fixture = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const directory = yield* fs.makeTempDirectoryScoped({ prefix: "t3-video-test-" });
  const source = `${directory}/recording.mp4`;
  yield* fs.writeFile(source, new Uint8Array([1]));
  const outputs: string[] = [];
  const runner = Layer.succeed(
    ProcessRunner,
    ProcessRunner.of({
      run: (input) =>
        Effect.gen(function* () {
          if (input.command === "ffprobe") return processResult(metadata);
          const output = input.args.at(-1)!;
          outputs.push(output);
          yield* fs.writeFile(output, new Uint8Array([255, 216, 255, 217])).pipe(Effect.orDie);
          return processResult("", "n: 0 pts: 0 pts_time:0");
        }),
    }),
  );
  const service = yield* VideoInspection.pipe(Effect.provide(layer.pipe(Layer.provide(runner))));
  return { fs, source, outputs, service };
});

it.effect("returns metadata and bounded timestamped images, and removes temporary frames", () =>
  Effect.gen(function* () {
    const { fs, source, outputs, service } = yield* fixture;
    const result = yield* service.inspect({}, { source, frameCount: 2 });
    expect(result.metadata).toMatchObject({
      durationSeconds: 10,
      width: 1920,
      frameRate: 30,
      hasAudio: false,
      bitrate: 123456,
    });
    expect(result.frames.map((frame) => frame.timestampSeconds)).toEqual([2.5, 7.5]);
    expect(Array.from(result.frames[0]!.data)).toEqual([255, 216, 255, 217]);
    expect(result.coverage.remainingFrames).toBe(94);
    for (const output of outputs) expect(yield* fs.exists(output)).toBe(false);
  }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
);

it.effect("enforces a cumulative per-video session budget and isolates other sessions", () =>
  Effect.gen(function* () {
    const { source, service } = yield* fixture;
    const owner = {};
    for (let i = 0; i < 8; i++) yield* service.inspect(owner, { source, frameCount: 12 });
    expect(
      Exit.isFailure(yield* Effect.exit(service.inspect(owner, { source, frameCount: 1 }))),
    ).toBe(true);
    expect((yield* service.inspect({}, { source, frameCount: 1 })).coverage.remainingFrames).toBe(
      95,
    );
  }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
);

it.effect("rejects oversized files and invalid crops", () =>
  Effect.gen(function* () {
    const { fs, source, service } = yield* fixture;
    expect(
      Exit.isFailure(
        yield* Effect.exit(
          service.inspect({}, { source, crop: { x: 1900, y: 0, width: 100, height: 100 } }),
        ),
      ),
    ).toBe(true);
    yield* fs.truncate(source, MAX_VIDEO_BYTES + 1);
    expect(Exit.isFailure(yield* Effect.exit(service.inspect({}, { source })))).toBe(true);
  }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
);

it.effect("explains missing FFmpeg dependencies", () =>
  Effect.gen(function* () {
    const { source } = yield* fixture;
    const service = yield* VideoInspection.pipe(
      Effect.provide(
        layer.pipe(
          Layer.provide(
            Layer.succeed(
              ProcessRunner,
              ProcessRunner.of({
                run: (input) =>
                  Effect.fail(
                    new ProcessSpawnError({
                      command: input.command,
                      argumentCount: input.args.length,
                      cause: "ENOENT",
                    }),
                  ),
              }),
            ),
          ),
        ),
      ),
    );
    const error = yield* service.inspect({}, { source }).pipe(Effect.flip);
    expect(error.message).toContain("Install FFmpeg");
  }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
);

it.effect("cancels processing and removes temporary artifacts", () =>
  Effect.gen(function* () {
    const { fs, source } = yield* fixture;
    const started = yield* Deferred.make<string>();
    const interrupted = yield* Deferred.make<void>();
    const service = yield* VideoInspection.pipe(
      Effect.provide(
        layer.pipe(
          Layer.provide(
            Layer.succeed(
              ProcessRunner,
              ProcessRunner.of({
                run: (input) =>
                  input.command === "ffprobe"
                    ? Effect.succeed(processResult(metadata))
                    : Effect.gen(function* () {
                        const output = input.args.at(-1)!;
                        yield* fs.writeFile(output, new Uint8Array([1])).pipe(Effect.orDie);
                        yield* Deferred.succeed(started, output);
                        return yield* Effect.never;
                      }).pipe(Effect.onInterrupt(() => Deferred.succeed(interrupted, undefined))),
              }),
            ),
          ),
        ),
      ),
    );
    const fiber = yield* service.inspect({}, { source }).pipe(Effect.forkChild);
    const output = yield* Deferred.await(started);
    yield* Fiber.interrupt(fiber);
    yield* Deferred.await(interrupted);
    expect(yield* fs.exists(output)).toBe(false);
  }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
);

it("samples requested intervals and rejects ranges outside the recording", () => {
  expect(
    sampleVideoTimes({ source: "/video", startSeconds: 2, endSeconds: 3, frameCount: 2 }, 10),
  ).toEqual([2.25, 2.75]);
  expect(sampleVideoTimes({ source: "/video", startSeconds: 2, endSeconds: 2 }, 10)).toEqual([2]);
  expect(() => sampleVideoTimes({ source: "/video", endSeconds: 11 }, 10)).toThrow();
});
