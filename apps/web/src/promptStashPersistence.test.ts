import { afterEach, expect, it, vi } from "vite-plus/test";

import type { PromptStashEntry } from "./promptStashStore";

const entry: PromptStashEntry = {
  id: "saved-prompt",
  createdAt: "2026-09-23T10:00:00.000Z",
  prompt: "Continue this tomorrow",
  attachments: [],
  droppedImageNames: [],
};

function persistentStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  };
}

async function restart() {
  vi.resetModules();
  return (await import("./promptStashStore")).usePromptStashStore;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.resetModules();
});

it("restores saved text and finalized images in a fresh session and persists removal", async () => {
  vi.stubGlobal("localStorage", persistentStorage());
  const first = await restart();
  expect(first.getState().stashEntry({ ...entry, pendingImageCount: 1 })).toMatchObject({
    written: true,
    durable: true,
  });
  const attachments = [
    {
      id: "image",
      name: "shot.png",
      mimeType: "image/png",
      sizeBytes: 3,
      dataUrl: "data:image/png;base64,AAAA",
    },
  ];
  expect(
    first.getState().finalizeEntryImages(entry.id, {
      attachments,
      droppedImageNames: [],
      unreadableImageNames: [],
    }).durable,
  ).toBe(true);
  const reopened = await restart();
  expect(reopened).not.toBe(first);
  expect(reopened.getState().entries).toEqual([
    {
      ...entry,
      attachments,
      pendingImageCount: 0,
      unreadableImageNames: [],
    },
  ]);
  expect(reopened.getState().takeEntry(entry.id).durable).toBe(true);
  expect((await restart()).getState().entries).toEqual([]);
});

it("refuses a memory-only stash so the composer is not cleared before closing", async () => {
  vi.stubGlobal("localStorage", undefined);
  const store = await restart();
  expect(store.getState().stashEntry(entry)).toEqual({
    written: false,
    durable: false,
    evicted: null,
  });
  expect(store.getState().entries).toEqual([]);
});

it("preserves the prompt when the app closes before images finish saving", async () => {
  vi.stubGlobal("localStorage", persistentStorage());
  const store = await restart();
  store.getState().stashEntry({ ...entry, pendingImageCount: 1 });
  const reopened = await restart();
  expect(reopened.getState().entries[0]).toMatchObject({
    prompt: entry.prompt,
    pendingImageCount: 0,
    unreadableImageNames: ["image 1 (not saved before reload)"],
  });
  expect(reopened.getState().takeEntry(entry.id).entry?.prompt).toBe(entry.prompt);
});

it("refuses stashing when browser policy blocks access to storage", async () => {
  vi.stubGlobal("localStorage", undefined);
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    get: () => {
      throw new Error("Storage blocked by policy");
    },
  });
  const store = await restart();
  expect(store.getState().stashEntry(entry)).toMatchObject({ written: false, durable: false });
  expect(store.getState().entries).toEqual([]);
});

it("keeps the last saved queue when storage rejects a new write", async () => {
  const storage = persistentStorage();
  vi.stubGlobal("localStorage", storage);
  const store = await restart();
  store.getState().stashEntry(entry);
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(storage, "setItem").mockImplementation(() => {
    throw new Error("Quota exceeded");
  });
  expect(store.getState().stashEntry({ ...entry, id: "unsaved" })).toMatchObject({
    written: false,
    durable: false,
  });
  expect(store.getState().entries).toEqual([entry]);
  expect((await restart()).getState().entries).toEqual([entry]);
});
