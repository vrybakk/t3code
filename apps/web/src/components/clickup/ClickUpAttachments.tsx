import type { ClickUpAttachment } from "@t3tools/contracts";
import { filePreviewKind } from "@t3tools/shared/filePreview";
import { ExternalLinkIcon, FileIcon, ImageIcon, PlayIcon } from "lucide-react";
import { useState } from "react";
import { ExpandedImageDialog } from "../chat/ExpandedImageDialog";
import type { ExpandedImagePreview } from "../chat/ExpandedImagePreview";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { safeClickUpAttachmentUrl } from "./taskPrompt";

export function ClickUpAttachments({
  attachments,
}: {
  attachments: ReadonlyArray<ClickUpAttachment>;
}) {
  const [preview, setPreview] = useState<ExpandedImagePreview | null>(null);
  const media = attachments.flatMap((attachment) => {
    const src = safeClickUpAttachmentUrl(attachment.url);
    const extension = attachment.extension;
    const mimeType = attachment.mimeType ?? (extension?.includes("/") ? extension : undefined);
    const name =
      extension &&
      !extension.includes("/") &&
      !attachment.name.toLowerCase().endsWith(`.${extension.toLowerCase()}`)
        ? `${attachment.name}.${extension}`
        : attachment.name;
    const kind = filePreviewKind({ name, ...(mimeType ? { mimeType } : {}) });
    return src && (kind === "image" || kind === "video")
      ? [
          {
            src,
            name: attachment.name,
            originalUrl: src,
            ...(kind === "video" ? { type: "video" as const, autoPlay: false } : {}),
          },
        ]
      : [];
  });
  return (
    <>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,12rem),1fr))] gap-3">
        {attachments.map((attachment) => {
          const url = safeClickUpAttachmentUrl(attachment.url);
          const mediaIndex = media.findIndex((item) => item.src === url);
          const item = media[mediaIndex];
          return (
            <div
              key={attachment.url}
              className="min-w-0 overflow-hidden rounded-lg border border-border bg-muted/10"
            >
              {item ? (
                <button
                  type="button"
                  onClick={() => setPreview({ images: media, index: mediaIndex })}
                  aria-label={`Preview ${attachment.name}`}
                  className="group relative flex h-36 w-full items-center justify-center overflow-hidden bg-muted/30 hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <AttachmentThumbnail
                    key={attachment.thumbnailUrl ?? attachment.url}
                    url={
                      item.type === "video"
                        ? safeClickUpAttachmentUrl(attachment.thumbnailUrl ?? "")
                        : (safeClickUpAttachmentUrl(attachment.thumbnailUrl ?? "") ?? url)
                    }
                    name={attachment.name}
                    video={item.type === "video"}
                  />
                </button>
              ) : (
                <div className="flex h-16 items-center justify-center text-muted-foreground">
                  <FileIcon className="size-6" />
                </div>
              )}
              <div className="flex items-center gap-2 p-3">
                <Tooltip>
                  <TooltipTrigger render={<span className="min-w-0 flex-1 truncate text-xs" />}>
                    {attachment.name}
                  </TooltipTrigger>
                  <TooltipPopup>{attachment.name}</TooltipPopup>
                </Tooltip>
                {url && (
                  <a
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`Open original ${attachment.name}`}
                    className="shrink-0 text-muted-foreground hover:text-foreground"
                  >
                    <ExternalLinkIcon className="size-3.5" />
                  </a>
                )}
              </div>
              {!url && (
                <p className="px-3 pb-3 text-xs text-muted-foreground">
                  Open in ClickUp to view this file.
                </p>
              )}
            </div>
          );
        })}
      </div>
      {preview && <ExpandedImageDialog preview={preview} onClose={() => setPreview(null)} />}
    </>
  );
}

function AttachmentThumbnail({
  url,
  name,
  video,
}: {
  url: string | null;
  name: string;
  video: boolean;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <>
      {url && !failed ? (
        <img
          src={url}
          alt={name}
          loading="lazy"
          onError={() => setFailed(true)}
          className="h-full w-full object-contain"
        />
      ) : video ? null : (
        <ImageIcon className="size-7 text-muted-foreground" />
      )}
      {video && (
        <span className="absolute flex size-10 items-center justify-center rounded-full bg-background/90 text-foreground shadow-sm">
          <PlayIcon className="size-5" />
        </span>
      )}
      {failed && (
        <span className="absolute inset-x-0 bottom-0 bg-background/90 px-2 py-1 text-xs text-muted-foreground">
          Preview unavailable · Open original
        </span>
      )}
    </>
  );
}
