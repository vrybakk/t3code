import { afterEach, describe, expect, it, vi } from "vite-plus/test";

const { execute } = vi.hoisted(() => ({ execute: vi.fn() }));
vi.mock("node:child_process", () => ({
  execFile: execute,
}));

import { isHistoryTrashSupported, moveHistoryToTrash } from "./storageHistoryTrash.ts";

afterEach(() => {
  vi.restoreAllMocks();
  execute.mockReset();
});

describe("history Trash on the environment host", () => {
  it("passes a history path as an argument, never executable source", async () => {
    execute.mockImplementation((_command, _args, _options, callback) => callback(null, "", ""));
    const path = "/tmp/disposable/'quoted'; $(not-a-command).jsonl";
    await moveHistoryToTrash(path, "darwin");
    const [command, args] = execute.mock.calls[0]!;
    expect(command).toBe("/usr/bin/osascript");
    expect(args.at(-1)).toBe(path);
    expect(args.at(-2)).toBe("--");
    expect(args[3]).not.toContain(path);
  });

  it("rejects unsupported hosts without executing a permanent deletion", async () => {
    expect(isHistoryTrashSupported("linux")).toBe(false);
    await expect(moveHistoryToTrash("/tmp/disposable.jsonl", "linux")).rejects.toThrow(
      "not available",
    );
    expect(execute).not.toHaveBeenCalled();
  });

  it("surfaces a failed Trash operation without falling back to deletion", async () => {
    execute.mockImplementation((_command, _args, _options, callback) =>
      callback(new Error("Trash unavailable")),
    );
    await expect(moveHistoryToTrash("/tmp/disposable.jsonl", "darwin")).rejects.toThrow(
      "Trash unavailable",
    );
    expect(execute).toHaveBeenCalledTimes(1);
  });
});
