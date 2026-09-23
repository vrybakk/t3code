import { describe, expect, it } from "vite-plus/test";
import { ProviderDriverKind, ProviderInstanceId, ThreadId } from "@t3tools/contracts";
import type { ScannedHistory } from "./storageUsageScan.ts";
import { createStorageHistoryLinker } from "./storageUsageLinks.ts";
import { groupStorageHistories } from "./storageUsageGroups.ts";

function history(id: string, parentSessionId?: string, homePath = "/account-a"): ScannedHistory {
  return {
    filePath: `${homePath}/${id}.jsonl`,
    provider: "codex",
    logicalBytes: 100,
    allocatedBytes: 512,
    modifiedAt: "2026-09-23T00:00:00.000Z",
    archived: false,
    threads: [],
    sessionId: id,
    parentSessionId,
    instanceIds: [homePath.slice(1)],
    homePath,
    device: 1,
    inode: 0,
    birthtimeMs: 0,
  };
}
const binding = (native: string, account = "/account-a") => ({
  threadId: ThreadId.make(`t3-${native}`),
  provider: ProviderDriverKind.make("codex"),
  providerInstanceId: ProviderInstanceId.make(account.slice(1)),
  resumeCursor: { threadId: native },
  lastSeenAt: "2026-09-23T00:00:00.000Z",
});

describe("storage conversation grouping", () => {
  it("rolls explicit multilevel subagents into their native parent without counting bytes twice", () => {
    const result = groupStorageHistories(
      [history("grandchild", "child"), history("parent"), history("child", "parent")],
      createStorageHistoryLinker([], [binding("parent")], []),
    );
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0]).toMatchObject({
      fileCount: 3,
      logicalBytes: 300,
      subagentCount: 2,
      parentMissing: false,
    });
    expect(result.histories.map((entry) => entry.relationship)).toEqual([
      "subagent",
      "direct",
      "subagent",
    ]);
    expect(result.histories.every((entry) => entry.threads[0]?.threadId === "t3-parent")).toBe(
      true,
    );
  });

  it("links a missing native parent via its direct provider binding", () => {
    const result = groupStorageHistories(
      [history("child", "missing")],
      createStorageHistoryLinker([], [binding("missing")], []),
    );
    expect(result.groups[0]).toMatchObject({ parentMissing: true, subagentCount: 1 });
    expect(result.groups[0]?.threads[0]?.threadId).toBe("t3-missing");
  });

  it("does not group copied session IDs across different physical homes or accounts", () => {
    const result = groupStorageHistories(
      [history("parent"), history("child", "parent", "/account-b")],
      createStorageHistoryLinker([], [binding("parent")], []),
    );
    expect(result.groups).toHaveLength(2);
    expect(result.histories[1]?.threads).toEqual([]);
    expect(result.groups.find((group) => group.parentMissing)).toBeDefined();
  });

  it("finds a hardlinked parent through its second proven home", () => {
    const parent = {
      ...history("parent"),
      homePaths: ["/account-a", "/account-b"],
      instanceIds: ["account-a", "account-b"],
    };
    const result = groupStorageHistories(
      [parent, history("child", "parent", "/account-b")],
      createStorageHistoryLinker([], [binding("parent", "/account-b")], []),
    );
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0]).toMatchObject({
      fileCount: 2,
      parentMissing: false,
      subagentCount: 1,
    });
    expect(result.histories[1]?.threads[0]?.threadId).toBe("t3-parent");
  });

  it("keeps conflicting parents and cycles separate instead of guessing ownership", () => {
    const raw = [
      history("a", "b"),
      history("b", "a"),
      history("conflict", "one"),
      { ...history("conflict", "two"), filePath: "/account-a/duplicate.jsonl" },
    ];
    const result = groupStorageHistories(raw, createStorageHistoryLinker([], [], []));
    expect(result.groups).toHaveLength(4);
    expect(result.unresolvedAncestry).toBe(true);
    expect(result.histories.every((entry) => entry.relationship === "unlinked")).toBe(true);
  });

  it("caps pathological ancestry depth and clearly labels unread metadata", () => {
    const raw = Array.from({ length: 400 }, (_, index) =>
      history(String(index), index < 399 ? String(index + 1) : undefined),
    );
    raw.push({ ...history("unknown"), sessionId: undefined });
    const result = groupStorageHistories(raw, createStorageHistoryLinker([], [], []));
    expect(result.unresolvedAncestry).toBe(true);
    expect(result.groups.some((entry) => entry.label === "Metadata unavailable")).toBe(true);
    expect(result.groups.reduce((sum, group) => sum + group.fileCount, 0)).toBe(401);
  });
});
