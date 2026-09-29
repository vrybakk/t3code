import type { EnvironmentId, ThreadId } from "@t3tools/contracts";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import type { ReactNode } from "react";
import { canOpenLinksInApp } from "../../browser/browserLinkTarget";
import { openUrlInPreview } from "../../browser/openFileInPreview";
import { useOpenLink } from "../../browser/useOpenLink";
import { recordVisitForThread } from "../../browserHistoryStore";
import { writeTextToClipboard } from "../../hooks/useCopyToClipboard";
import { useOpenChangeRequestLink } from "../../lib/openPullRequestLink";
import { readLocalApi } from "../../localApi";
import { previewEnvironment } from "../../state/preview";
import { useAtomCommand } from "../../state/use-atom-command";
import { showExternalLinkContextMenu } from "../chat/externalLinkContextMenu";
import { toastManager } from "../ui/toast";

export function HandoffPullRequestLink({
  environmentId,
  threadId,
  url,
  children,
}: {
  environmentId: EnvironmentId;
  threadId: ThreadId | undefined;
  url: string;
  children: ReactNode;
}) {
  const threadRef = threadId ? { environmentId, threadId } : undefined;
  const openPr = useOpenChangeRequestLink(threadRef);
  const openLink = useOpenLink(threadRef);
  const openPreview = useAtomCommand(previewEnvironment.open, { reportFailure: false });
  const reportFailure = (_operation: string, cause: unknown) => {
    toastManager.add({
      type: "error",
      title: "Could not open pull request link",
      description: cause instanceof Error ? cause.message : "Please try again.",
    });
  };
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="text-primary hover:underline"
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
      {children}
    </a>
  );
}
