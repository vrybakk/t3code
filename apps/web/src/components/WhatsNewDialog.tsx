import { useState } from "react";
import type { NerdReleaseNotes, NerdReleaseSection } from "@t3tools/shared/nerdReleaseNotes";
import {
  acknowledgeNerdBuild,
  nerdReleaseNotes,
  readSeenNerdBuilds,
  useWhatsNewRequest,
} from "../nerdReleaseNotes";
import { openDesktopUpdateReleaseNotes } from "./desktopUpdate.toast";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogPopup,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogPanel,
  DialogFooter,
} from "./ui/dialog";
import { toastManager } from "./ui/toast";

function ReleaseSection({
  title,
  section,
  comparedToPreviousRelease,
}: {
  title: string;
  section: NerdReleaseSection | null;
  comparedToPreviousRelease: boolean;
}) {
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-medium">{title}</h3>
      {section?.items.length ? (
        <ul className="list-disc space-y-2 pl-4 text-sm leading-relaxed text-muted-foreground">
          {section.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">
          {!section
            ? "Upstream changes are not separately identified in this build."
            : section.changeCount === 0
              ? comparedToPreviousRelease
                ? "No new changes in this release."
                : "No separate change summary for this build’s baseline."
              : "Maintenance updates. See the full changelog for details."}
        </p>
      )}
      {section && section.changeCount > 0 ? (
        <button
          type="button"
          className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
          onClick={() => {
            void openDesktopUpdateReleaseNotes(window.desktopBridge, section.sourceUrl);
          }}
        >
          {section.changeCount} {section.changeCount === 1 ? "change" : "changes"} · View source
          changes
        </button>
      ) : null}
    </section>
  );
}

export function WhatsNewDialog({ release }: { release: NerdReleaseNotes }) {
  const requested = useWhatsNewRequest((state) => state.open);
  const [dismissed, setDismissed] = useState(() => readSeenNerdBuilds().includes(release.buildId));
  const close = () => {
    setDismissed(true);
    useWhatsNewRequest.setState({ open: false });
    try {
      acknowledgeNerdBuild(release.buildId);
    } catch {
      toastManager.add({
        type: "error",
        title: "Could not save your preference",
        description: "This summary may appear again when you restart the app.",
      });
    }
  };
  return (
    <Dialog
      open={requested || !dismissed}
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DialogPopup>
        <DialogHeader>
          <DialogTitle>What’s new in Nerd</DialogTitle>
          <DialogDescription>
            {release.version} · Build {release.commit.slice(0, 7)}
          </DialogDescription>
        </DialogHeader>
        <DialogPanel className="space-y-6">
          <p className="text-sm text-muted-foreground">
            {release.comparedToPreviousRelease
              ? "Highlights since the previous release."
              : "Highlights included in this build."}{" "}
            You can reopen this summary in Settings → General → About.
          </p>
          <ReleaseSection
            title="Nerd improvements"
            section={release.nerd}
            comparedToPreviousRelease={release.comparedToPreviousRelease}
          />
          <ReleaseSection
            title="T3 Code updates"
            section={release.upstream}
            comparedToPreviousRelease={release.comparedToPreviousRelease}
          />
        </DialogPanel>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              void openDesktopUpdateReleaseNotes(window.desktopBridge, release.changelogUrl);
            }}
          >
            Full changelog
          </Button>
          <Button onClick={close}>Got it</Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}

export function WhatsNewDialogHost() {
  return nerdReleaseNotes ? (
    <WhatsNewDialog key={nerdReleaseNotes.buildId} release={nerdReleaseNotes} />
  ) : null;
}
