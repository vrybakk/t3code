import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";

const branding = vi.hoisted(() => ({ IS_NERD_EDITION: false }));
vi.mock("./branding", () => branding);
const notes = { buildId: "1.0.0:abc", version: "1.0.0" };

beforeEach(() => {
  vi.resetModules();
  branding.IS_NERD_EDITION = false;
  vi.stubEnv("DEV", false);
  vi.stubGlobal("__T3CODE_NERD_RELEASE_NOTES__", notes);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

it("ignores bundled Nerd notes in an official desktop or ordinary production web client", async () => {
  expect((await import("./nerdReleaseNotes")).nerdReleaseNotes).toBeNull();
});

it("uses the installed Nerd build's notes, independent of the connected server", async () => {
  branding.IS_NERD_EDITION = true;
  expect((await import("./nerdReleaseNotes")).nerdReleaseNotes).toEqual(notes);
});

it("supports an explicitly configured Nerd development preview", async () => {
  vi.stubEnv("DEV", true);
  expect((await import("./nerdReleaseNotes")).nerdReleaseNotes).toEqual(notes);
});
