import * as Path from "effect/Path";
import * as Stream from "effect/Stream";
import { FetchHttpClient, HttpClient } from "effect/unstable/http";
import { type ClickUpAttachment } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";

const allowedEstimationAttachmentUrl = (value: string) => {
  const url = new URL(value);
  return (
    url.protocol === "https:" &&
    !url.username &&
    !url.password &&
    (!url.port || url.port === "443") &&
    (url.hostname === "attachments.clickup.com" ||
      url.hostname.endsWith(".clickup-attachments.com"))
  );
};
export const collectEstimationAttachments = Effect.fn("collectEstimationAttachments")(function* (
  attachments: ReadonlyArray<ClickUpAttachment>,
  cwd: string,
  imagesSupported: boolean,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const imagePaths: string[] = [];
  const evidence: Array<{ name: string; status: string; text?: string }> = [];
  for (const [index, attachment] of attachments.entries()) {
    if (index >= 6) {
      evidence.push({ name: attachment.name, status: "Not inspected: six-attachment limit." });
      continue;
    }
    const image =
      /\.(png|jpe?g|webp)$/i.test(attachment.name) ||
      /^image\/(png|jpeg|webp)$/.test(attachment.mimeType ?? "");
    const text =
      /\.(txt|md|csv|json|log)$/i.test(attachment.name) ||
      /^(text\/(plain|markdown|csv)|application\/json)$/.test(attachment.mimeType ?? "");
    if ((!image && !text) || (image && !imagesSupported)) {
      evidence.push({
        name: attachment.name,
        status: image
          ? "Not inspected: this provider does not support estimation images."
          : "Not inspected: unsupported attachment format (including video/PDF).",
      });
      continue;
    }
    const downloaded = yield* Effect.scoped(
      Effect.gen(function* () {
        const client = yield* HttpClient.HttpClient;
        let url = attachment.url;
        for (let redirect = 0; redirect < 3; redirect++) {
          const allowed = yield* Effect.try(() => allowedEstimationAttachmentUrl(url));
          if (!allowed) return null;
          const response = yield* client.get(url);
          if (response.status >= 300 && response.status < 400) {
            const location = response.headers.location;
            if (!location) return null;
            url = yield* Effect.try(() => new URL(location, url).href);
            continue;
          }
          const contentType = response.headers["content-type"]?.split(";")[0] ?? "";
          if (
            response.status !== 200 ||
            (image
              ? !/^image\/(png|jpeg|webp)$/.test(contentType)
              : !/^(text\/(plain|markdown|csv)|application\/json)$/.test(contentType))
          )
            return null;
          let size = 0;
          const chunks = yield* response.stream.pipe(
            Stream.mapEffect((chunk) => {
              size += chunk.length;
              return size > (image ? 4_000_000 : 500_000)
                ? Effect.fail("Attachment too large")
                : Effect.succeed(chunk);
            }),
            Stream.runCollect,
          );
          return { bytes: Buffer.concat(chunks), contentType };
        }
        return null;
      }),
    ).pipe(
      Effect.provide(FetchHttpClient.layer),
      Effect.provideService(FetchHttpClient.RequestInit, { redirect: "manual" }),
      Effect.timeout("15 seconds"),
      Effect.orElseSucceed(() => null),
    );
    if (!downloaded) {
      evidence.push({
        name: attachment.name,
        status:
          "Not inspected: attachment inaccessible, too large, or unsupported host/content type.",
      });
      continue;
    }
    if (image) {
      const extension = downloaded.contentType.split("/")[1]!;
      const imagePath = path.join(cwd, `task-evidence-${index}.${extension}`);
      yield* fs.writeFile(imagePath, downloaded.bytes);
      imagePaths.push(imagePath);
      evidence.push({
        name: attachment.name,
        status: `Image supplied to estimator as image ${imagePaths.length}.`,
      });
    } else {
      const full = downloaded.bytes.toString("utf8");
      evidence.push({
        name: attachment.name,
        status:
          full.length > 20_000
            ? "Text inspected, truncated at 20000 characters."
            : "Text inspected.",
        text: full.slice(0, 20_000),
      });
    }
  }
  return {
    imagePaths,
    evidence,
    limitations: evidence
      .filter((a) => a.status.startsWith("Not inspected") || a.status.includes("truncated"))
      .map((a) => `${a.name}: ${a.status}`),
  };
});
