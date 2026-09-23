import * as Schema from "effect/Schema";
import { create } from "zustand";
import { IS_NERD_EDITION } from "./branding";
import { getLocalStorageItem, setLocalStorageItem } from "./hooks/useLocalStorage";

export const nerdReleaseNotes =
  IS_NERD_EDITION || import.meta.env.DEV ? __T3CODE_NERD_RELEASE_NOTES__ : null;
export const NERD_SEEN_BUILDS_KEY = "t3code:nerd-seen-builds:v1";
const SeenBuilds = Schema.Array(Schema.String);

export const useWhatsNewRequest = create(() => ({ open: false }));
export const openWhatsNew = () => useWhatsNewRequest.setState({ open: true });

export function readSeenNerdBuilds(): ReadonlyArray<string> {
  try {
    return getLocalStorageItem(NERD_SEEN_BUILDS_KEY, SeenBuilds) ?? [];
  } catch {
    // A damaged preference must not prevent startup or make dismissal impossible.
    return [];
  }
}

export function acknowledgeNerdBuild(buildId: string): void {
  setLocalStorageItem(
    NERD_SEEN_BUILDS_KEY,
    [...new Set([...readSeenNerdBuilds(), buildId])],
    SeenBuilds,
  );
}
