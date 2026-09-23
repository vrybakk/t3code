// @effect-diagnostics nodeBuiltinImport:off - Detect optional FFmpeg binaries before registering integration tests.
import * as NodeChildProcess from "node:child_process";
import * as NodeHttp from "node:http";
import { expect, it } from "@effect/vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import { McpSchema, McpServer } from "effect/unstable/ai";
import { EnvironmentId, ProviderInstanceId, ThreadId } from "@t3tools/contracts";
import * as ProcessRunner from "../processRunner.ts";
import { McpInvocationContext } from "../mcp/McpInvocationContext.ts";
import { VideoToolkitRegistrationLive } from "../mcp/toolkits/video/registration.ts";
import * as VideoInspection from "./VideoInspectionService.ts";

const hasFfmpeg = (() => {
  try {
    NodeChildProcess.execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
    NodeChildProcess.execFileSync("ffprobe", ["-version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

const testLayer = VideoToolkitRegistrationLive.pipe(
  Layer.provideMerge(McpServer.McpServer.layer),
  Layer.provide(VideoInspection.layer),
  Layer.provideMerge(ProcessRunner.layer),
  Layer.provideMerge(NodeServices.layer),
);

const client = McpSchema.McpServerClient.of({
  clientId: 1,
  clientCapabilities: {},
  clientInfo: { name: "video-test", version: "1" },
  protocolVersion: "2025-06-18",
  initializePayload: {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "video-test", version: "1" },
  },
  getClient: Effect.die("unused"),
});

(hasFfmpeg ? it.effect : it.effect.skip)(
  "decodes a real video and delivers timestamped MCP image blocks",
  () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const runner = yield* ProcessRunner.ProcessRunner;
      const dir = yield* fs.makeTempDirectoryScoped({ prefix: "t3-video-integration-" });
      const source = `${dir}/fixture.mp4`;
      const generated = yield* runner.run({
        command: "ffmpeg",
        args: [
          "-nostdin",
          "-v",
          "error",
          "-f",
          "lavfi",
          "-i",
          "testsrc2=size=320x240:rate=10:duration=2",
          "-c:v",
          "mpeg4",
          source,
        ],
      });
      expect(generated.code).toBe(0);
      const server = yield* McpServer.McpServer;
      const invocation = {
        environmentId: EnvironmentId.make("video-test"),
        threadId: ThreadId.make("video-test"),
        providerSessionId: "video-test",
        providerInstanceId: ProviderInstanceId.make("codex"),
        capabilities: new Set(["video"] as const),
        issuedAt: 0,
      };
      const call = (args: Record<string, unknown>) =>
        server
          .callTool({ name: "video_inspect", arguments: args })
          .pipe(
            Effect.provideService(McpInvocationContext, invocation),
            Effect.provideService(McpSchema.McpServerClient, client),
          );
      const result = yield* call({ source, frameCount: 2 });
      expect(result.isError).toBe(false);
      expect(result.content.map((entry) => entry.type)).toEqual([
        "text",
        "text",
        "image",
        "text",
        "image",
      ]);
      expect(result.structuredContent).toMatchObject({
        metadata: { durationSeconds: 2, width: 320, height: 240, frameRate: 10 },
        frames: [{ timestampSeconds: 0.5 }, { timestampSeconds: 1.5 }],
      });
      const crop = yield* call({
        source,
        startSeconds: 0.5,
        endSeconds: 0.5,
        crop: { x: 0, y: 0, width: 100, height: 100 },
      });
      expect(crop.isError).toBe(false);
      const invalid = yield* call({ source, frameCount: 13 });
      expect(invalid.isError).toBe(true);
      const denied = yield* server.callTool({ name: "video_inspect", arguments: { source } }).pipe(
        Effect.provideService(McpInvocationContext, {
          ...invocation,
          capabilities: new Set<"video">(),
        }),
        Effect.provideService(McpSchema.McpServerClient, client),
      );
      expect(denied.isError).toBe(true);

      const bytes = yield* fs.readFile(source);
      const downloadServer = yield* Effect.acquireRelease(
        Effect.promise(
          () =>
            new Promise<NodeHttp.Server>((resolve) => {
              const listener = NodeHttp.createServer((request, response) => {
                if (request.url === "/private") {
                  response.writeHead(403).end();
                  return;
                }
                if (request.url === "/page") {
                  response
                    .writeHead(200, { "content-type": "text/html" })
                    .end("<html>Login</html>");
                  return;
                }
                if (request.url === "/oversized") {
                  response.writeHead(200, { "content-length": String(251 * 1024 * 1024) }).end();
                  return;
                }
                if (request.url === "/redirect") {
                  response.writeHead(302, { location: "/clip" }).end();
                  return;
                }
                response.writeHead(200, { "content-type": "video/mp4" }).end(bytes);
              });
              listener.listen(0, "127.0.0.1", () => resolve(listener));
            }),
        ),
        (listener) =>
          Effect.promise(
            () =>
              new Promise<void>((resolve) => {
                listener.closeAllConnections();
                listener.close(() => resolve());
              }),
          ),
      );
      const address = downloadServer.address();
      if (!address || typeof address === "string")
        return yield* Effect.die("Missing fixture server port");
      const origin = `http://127.0.0.1:${address.port}`;
      const downloaded = yield* call({ source: `${origin}/redirect`, frameCount: 1 });
      expect(downloaded.isError).toBe(false);
      expect(downloaded.content.filter((item) => item.type === "image")).toHaveLength(1);
      for (const endpoint of ["private", "page", "oversized"]) {
        const rejected = yield* call({ source: `${origin}/${endpoint}` });
        expect(rejected.isError).toBe(true);
      }
    }).pipe(Effect.scoped, Effect.provide(testLayer)),
);
