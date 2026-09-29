import type { EnvironmentId, ScopedThreadRef } from "@t3tools/contracts";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import { Children, type ReactNode } from "react";

import { canOpenLinksInApp } from "../browser/browserLinkTarget";
import { openUrlInPreview } from "../browser/openFileInPreview";
import { useOpenLink } from "../browser/useOpenLink";
import { recordVisitForThread } from "../browserHistoryStore";
import { writeTextToClipboard } from "../hooks/useCopyToClipboard";
import { useOpenChangeRequestLink } from "../lib/openPullRequestLink";
import { cn } from "../lib/utils";
import { readLocalApi } from "../localApi";
import { previewEnvironment } from "../state/preview";
import { useAtomCommand } from "../state/use-atom-command";
import {
  resolveExternalWebLinkHost,
  showExternalLinkContextMenu,
} from "./chat/externalLinkContextMenu";
import { LinkFavicon } from "./LinkFavicon";
import { toastManager } from "./ui/toast";

/**
 * A web link outside chat markdown that behaves like one inside it: the site icon before the
 * text, change requests opening in the PR panel, other links following the "Open links in"
 * setting, and the same right-click menu. Without a thread there is no integrated browser to
 * offer, so those links go to the system browser.
 */
export function ExternalLink({
  url,
  environmentId,
  threadRef,
  favicon = true,
  className,
  "aria-label": ariaLabel,
  children,
}: {
  url: string;
  /** Environment whose projects resolve change request links when there is no thread. */
  environmentId?: EnvironmentId | undefined;
  threadRef?: ScopedThreadRef | undefined;
  favicon?: boolean;
  className?: string;
  "aria-label"?: string;
  children: ReactNode;
}) {
  const openPr = useOpenChangeRequestLink(threadRef);
  const openLink = useOpenLink(threadRef);
  const openPreview = useAtomCommand(previewEnvironment.open, { reportFailure: false });
  const host = favicon ? resolveExternalWebLinkHost(url) : null;
  const reportFailure = (_operation: string, cause: unknown) => {
    toastManager.add({
      type: "error",
      title: "Could not open link",
      description: cause instanceof Error ? cause.message : "Please try again.",
    });
  };
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      aria-label={ariaLabel}
      className={cn("text-info-foreground hover:underline", className)}
      onClick={(event) => {
        if (event.metaKey || event.ctrlKey) return;
        if (openPr(event, url, undefined, environmentId)) return;
        event.preventDefault();
        event.stopPropagation();
        void openLink(url).catch((cause: unknown) => reportFailure("open-link", cause));
      }}
      onContextMenu={(event) => {
        const api = readLocalApi();
        if (!api) return;
        event.preventDefault();
        event.stopPropagation();
        void showExternalLinkContextMenu({
          href: url,
          canOpenInPreview: canOpenLinksInApp(Boolean(threadRef)),
          position: { x: event.clientX, y: event.clientY },
          showContextMenu: (items, position) => api.contextMenu.show(items, position),
          openInPreview: async (target) => {
            if (!threadRef) return;
            const result = await openUrlInPreview({ threadRef, url: target, openPreview });
            if (isAtomCommandInterrupted(result)) return;
            if (result._tag === "Failure") throw squashAtomCommandFailure(result);
            recordVisitForThread(threadRef, target);
          },
          openExternal: (target) => api.shell.openExternal(target),
          copyLink: (target) => writeTextToClipboard(target, "link"),
          reportFailure,
        });
      }}
    >
      {host ? <FaviconLeadingText host={host}>{children}</FaviconLeadingText> : children}
    </a>
  );
}

/** Keeps the icon on the same line as the text it introduces, as chat links do. */
function FaviconLeadingText({ host, children }: { host: string; children: ReactNode }) {
  const [first, ...rest] = Children.toArray(children);
  const leading = typeof first === "string" ? first.slice(0, 1) : first;
  return (
    <>
      <span className="whitespace-nowrap">
        <LinkFavicon host={host} />
        {leading}
      </span>
      {typeof first === "string" && first.slice(1)}
      {rest}
    </>
  );
}
