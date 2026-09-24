import * as NodeCrypto from "node:crypto";
import * as NodeURL from "node:url";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Schema from "effect/Schema";
import { fromJsonStringPretty } from "@t3tools/shared/schemaJson";

const source = new URL("../src/studio/skills/studio-task-workflow/", import.meta.url);
const output = new URL("../src/studio/StudioTaskWorkflow.generated.json", import.meta.url);
const encodeJson = Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown));
const encodePrettyJson = Schema.encodeEffect(fromJsonStringPretty(Schema.Unknown));
const files = {
  skill: "SKILL.md",
  coordination: "references/coordination.md",
  requirements: "references/requirements.md",
  estimate: "references/estimate.md",
  implement: "references/implement.md",
  verification: "references/verification.md",
  communication: "references/communication.md",
};
await Effect.runPromise(
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const entries = yield* Effect.all(
      Object.entries(files).map(([key, path]) =>
        Effect.gen(function* () {
          const markdown = yield* fs.readFileString(NodeURL.fileURLToPath(new URL(path, source)));
          return [key, markdown.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "").trim()] as const;
        }),
      ),
    );
    const bundle = Object.fromEntries(entries);
    const serialized = yield* encodeJson(bundle);
    const version = NodeCrypto.createHash("sha256").update(serialized).digest("hex").slice(0, 16);
    const generated = `${yield* encodePrettyJson({ version, bundle })}\n`;
    if (process.argv.includes("--check")) {
      if ((yield* fs.readFileString(NodeURL.fileURLToPath(output))) !== generated) {
        throw new Error(
          "Studio workflow bundle is stale. Run bun scripts/generate-studio-workflow.ts from apps/server.",
        );
      }
    } else {
      yield* fs.writeFileString(NodeURL.fileURLToPath(output), generated);
      process.stdout.write(`Generated ${NodeURL.fileURLToPath(output)}\n`);
    }
  }).pipe(Effect.provide(NodeServices.layer)),
);
