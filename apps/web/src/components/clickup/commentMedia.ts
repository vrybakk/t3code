import type { ClickUpAttachment } from "@t3tools/contracts";
import { filePreviewKind } from "@t3tools/shared/filePreview";
import { safeClickUpAttachmentUrl } from "./taskPrompt";

const WEB_URL_PATTERN = /https:\/\/[^\s<>"'`]+/gu;
const TRAILING_PUNCTUATION_PATTERN = /[.,;:!?)\]}]+$/u;

function fileName(url: URL): string {
  const segment = url.pathname.split("/").findLast(Boolean) ?? "";
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

/**
 * Images and videos a comment links to in its text, as attachments. People often paste an
 * upload's URL instead of attaching it, and the comment should still show what it points at.
 * URLs the comment already carries as attachments are left out.
 */
export function commentLinkedMedia(
  text: string,
  attachments: ReadonlyArray<ClickUpAttachment> = [],
): ClickUpAttachment[] {
  const known = new Set(attachments.map((attachment) => safeClickUpAttachmentUrl(attachment.url)));
  const media: ClickUpAttachment[] = [];
  for (const [match] of text.matchAll(WEB_URL_PATTERN)) {
    let url: URL;
    try {
      url = new URL(match.replace(TRAILING_PUNCTUATION_PATTERN, ""));
    } catch {
      continue;
    }
    const name = fileName(url);
    const kind = filePreviewKind({ name });
    if ((kind !== "image" && kind !== "video") || known.has(url.href)) continue;
    known.add(url.href);
    media.push({ name, url: url.href });
  }
  return media;
}
