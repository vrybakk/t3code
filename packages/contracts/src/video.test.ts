import { describe, expect, it } from "vitest";
import * as Schema from "effect/Schema";
import { ChatFileAttachment } from "./orchestration.ts";
import { AttachmentCreateUploadUrlInput } from "./assets.ts";
import { fileAttachmentMaxBytes, PROVIDER_SEND_TURN_MAX_VIDEO_BYTES } from "./video.ts";

describe("video attachment limits", () => {
  const decodeAttachment = Schema.decodeUnknownSync(ChatFileAttachment);
  const decodeUpload = Schema.decodeUnknownSync(AttachmentCreateUploadUrlInput);
  const video = {
    type: "file",
    id: "video-test",
    name: "recording.mp4",
    mimeType: "video/mp4",
    sizeBytes: PROVIDER_SEND_TURN_MAX_VIDEO_BYTES,
  };
  it("accepts 250 MiB videos on upload and persisted message paths", () => {
    expect(decodeAttachment(video).sizeBytes).toBe(PROVIDER_SEND_TURN_MAX_VIDEO_BYTES);
    expect(decodeUpload(video).sizeBytes).toBe(PROVIDER_SEND_TURN_MAX_VIDEO_BYTES);
    expect(decodeUpload({ ...video, mimeType: "application/octet-stream" }).sizeBytes).toBe(
      PROVIDER_SEND_TURN_MAX_VIDEO_BYTES,
    );
  });
  it("keeps ordinary files at 50 MiB and rejects oversized videos", () => {
    for (const value of [
      { ...video, sizeBytes: PROVIDER_SEND_TURN_MAX_VIDEO_BYTES + 1 },
      { ...video, mimeType: "application/pdf" },
      { ...video, name: "archive.zip", mimeType: "application/octet-stream" },
    ]) {
      expect(() => decodeUpload(value)).toThrow();
      expect(() => decodeAttachment(value)).toThrow();
    }
    expect(fileAttachmentMaxBytes({ name: "recording.mp4", mimeType: "application/pdf" })).toBe(
      50 * 1024 * 1024,
    );
  });
});
