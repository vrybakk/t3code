import { act, type ReactNode } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import type { NerdReleaseNotes } from "@t3tools/shared/nerdReleaseNotes";

vi.mock("../branding", () => ({ IS_NERD_EDITION: false }));
vi.mock("./ui/button", () => ({ Button: "button" }));
vi.mock("./ui/dialog", () => ({
  Dialog: ({
    open,
    children,
    onOpenChange,
  }: {
    open: boolean;
    children: ReactNode;
    onOpenChange: (open: boolean) => void;
  }) =>
    open ? (
      <div role="dialog">
        <button onClick={() => onOpenChange(false)}>Dismiss</button>
        {children}
      </div>
    ) : null,
  DialogPopup: "div",
  DialogHeader: "header",
  DialogTitle: "h2",
  DialogDescription: "p",
  DialogPanel: "main",
  DialogFooter: "footer",
}));
vi.mock("./ui/toast", () => ({ toastManager: { add: vi.fn() } }));
vi.mock("./desktopUpdate.toast", () => ({ openDesktopUpdateReleaseNotes: vi.fn() }));

import { WhatsNewDialog, WhatsNewDialogHost } from "./WhatsNewDialog";
import { NERD_SEEN_BUILDS_KEY, openWhatsNew, useWhatsNewRequest } from "../nerdReleaseNotes";
import { toastManager } from "./ui/toast";
import { openDesktopUpdateReleaseNotes } from "./desktopUpdate.toast";

const release: NerdReleaseNotes = {
  buildId: "0.0.43:abc1234",
  version: "0.0.43",
  commit: "abc1234",
  comparedToPreviousRelease: true,
  changelogUrl: "https://github.com/vrybakk/t3code/compare/old...abc1234",
  nerd: {
    items: ["Clearer reports"],
    changeCount: 1,
    sourceUrl: "https://github.com/vrybakk/t3code/commits/abc1234",
  },
  upstream: {
    items: ["Faster startup"],
    changeCount: 2,
    sourceUrl: "https://github.com/pingdotgg/t3code/commits/upstream",
  },
};
let renderer: ReactTestRenderer | undefined;
let stored: Map<string, string>;

beforeEach(() => {
  stored = new Map();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: (key: string, value: string) => {
        stored.set(key, value);
      },
    },
  });
  useWhatsNewRequest.setState({ open: false });
});
afterEach(async () => {
  await act(async () => renderer?.unmount());
  renderer = undefined;
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
async function mount(notes = release) {
  await act(async () => {
    renderer = create(<WhatsNewDialog key={notes.buildId} release={notes} />);
  });
}
async function click(label: string) {
  const button = renderer!.root
    .findAllByType("button")
    .find((node) => node.children.includes(label));
  expect(button).toBeDefined();
  await act(async () => button!.props.onClick());
}
function isOpen() {
  return renderer!.root.findAllByProps({ role: "dialog" }).length > 0;
}

it("shows both bundled sections and keeps dismissal across app restarts", async () => {
  await mount();
  expect(isOpen()).toBe(true);
  expect(renderer!.root.findAllByType("li").map((node) => node.children[0])).toEqual([
    "Clearer reports",
    "Faster startup",
  ]);
  await click("Got it");
  expect(isOpen()).toBe(false);
  await act(async () => renderer!.unmount());
  await mount();
  expect(isOpen()).toBe(false);
});

it("distinguishes builds with the same version and remembers rollback dismissals", async () => {
  await mount();
  await click("Dismiss");
  const newer = { ...release, buildId: "0.0.43:def5678", commit: "def5678" };
  await act(async () => renderer!.update(<WhatsNewDialog key={newer.buildId} release={newer} />));
  expect(isOpen()).toBe(true);
  await click("Got it");
  await act(async () =>
    renderer!.update(<WhatsNewDialog key={release.buildId} release={release} />),
  );
  expect(isOpen()).toBe(false);
});

it("can reopen from Settings without losing the dismissal", async () => {
  await mount();
  await click("Got it");
  await act(async () => openWhatsNew());
  expect(isOpen()).toBe(true);
  await click("Nerd changelog");
  expect(openDesktopUpdateReleaseNotes).toHaveBeenCalledWith(undefined, release.changelogUrl);
  await click("Dismiss");
  expect(isOpen()).toBe(false);
});

it("replaces a corrupt preference when dismissed", async () => {
  stored.set(NERD_SEEN_BUILDS_KEY, "broken-json");
  await mount();
  await click("Got it");
  expect(JSON.parse(stored.get(NERD_SEEN_BUILDS_KEY)!)).toEqual([release.buildId]);
});

it("still closes when persistence is unavailable, with an honest warning", async () => {
  window.localStorage.setItem = () => {
    throw new Error("Storage unavailable");
  };
  await mount();
  await click("Got it");
  expect(isOpen()).toBe(false);
  expect(toastManager.add).toHaveBeenCalledWith(
    expect.objectContaining({ title: "Could not save your preference" }),
  );
});

it("does not show Nerd notes in an ordinary web or official desktop client", async () => {
  await act(async () => {
    renderer = create(<WhatsNewDialogHost />);
  });
  expect(isOpen()).toBe(false);
});
