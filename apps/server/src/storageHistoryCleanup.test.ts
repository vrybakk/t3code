// @effect-diagnostics nodeBuiltinImport:off -- All destructive cases use dedicated mkdtemp fixtures only.
import * as NodeFSP from "node:fs/promises";
import * as NodePath from "node:path";
import { describe, expect, it } from "vite-plus/test";
import { cleanupFixture as fixture } from "./testFixtures/storageHistoryCleanup.ts";

describe("reviewed native history cleanup", () => {
  it("reviews without writes, moves exact reviewed history to trash and replays idempotently", async () => {
    const test = await fixture();
    const review = await test.cleanup.review(test.reviewInput);
    expect(review.eligibleCount).toBe(1);
    expect(await NodeFSP.readFile(test.file, "utf8")).toContain("native-one");
    const result = await test.cleanup.execute(test.executeInput(review.planId));
    expect(result.items[0]?.status).toBe("trashed");
    expect(await NodeFSP.readFile(NodePath.join(test.root, "trashed.jsonl"), "utf8")).toContain(
      "native-one",
    );
    expect(await test.cleanup.execute(test.executeInput(review.planId))).toEqual(result);
    expect(test.trashCalls()).toBe(1);
    expect(result.processedTotals.fileCount).toBe(1);
  });

  it("requires separate permanent deletion and external activity confirmations", async () => {
    const test = await fixture();
    const review = await test.cleanup.review(test.reviewInput);
    await expect(
      test.cleanup.execute({
        ...test.executeInput(review.planId),
        acknowledgeExternalSessionsStopped: false,
      }),
    ).rejects.toMatchObject({ reason: "confirmation-required" });
    await expect(
      test.cleanup.execute({ ...test.executeInput(review.planId), mode: "delete" }),
    ).rejects.toMatchObject({ reason: "confirmation-required" });
    const result = await test.cleanup.execute({
      ...test.executeInput(review.planId),
      mode: "delete",
      confirmPermanentDelete: true,
    });
    expect(result.items[0]?.status).toBe("deleted");
    await expect(NodeFSP.stat(test.file)).rejects.toMatchObject({ code: "ENOENT" });
    expect(test.trashCalls()).toBe(0);
  });

  it("never falls back to deletion when trash fails or is unsupported", async () => {
    const test = await fixture();
    const review = await test.cleanup.review(test.reviewInput);
    test.failTrash();
    expect((await test.cleanup.execute(test.executeInput(review.planId))).items[0]?.status).toBe(
      "failed",
    );
    expect((await NodeFSP.stat(test.file)).isFile()).toBe(true);
    const unsupported = await fixture({ trashSupported: false });
    const unsupportedReview = await unsupported.cleanup.review(unsupported.reviewInput);
    await expect(
      unsupported.cleanup.execute(unsupported.executeInput(unsupportedReview.planId)),
    ).rejects.toMatchObject({ reason: "unsupported" });
    expect((await NodeFSP.stat(unsupported.file)).isFile()).toBe(true);
  });

  it.each(["changed", "replaced", "symlink", "active"] as const)(
    "blocks %s targets on fresh execution validation",
    async (state) => {
      const test = await fixture();
      const review = await test.cleanup.review(test.reviewInput);
      if (state === "changed") await NodeFSP.appendFile(test.file, "new activity\n");
      if (state === "replaced") {
        await NodeFSP.rename(test.file, `${test.file}.old`);
        await NodeFSP.writeFile(test.file, "replacement");
      }
      if (state === "symlink") {
        await NodeFSP.rename(test.file, `${test.file}.old`);
        await NodeFSP.symlink(`${test.file}.old`, test.file);
      }
      if (state === "active") test.nativeSessionKeys.add("codex:codex:native-one");
      expect((await test.cleanup.execute(test.executeInput(review.planId))).items[0]?.status).toBe(
        "blocked",
      );
      expect(test.trashCalls()).toBe(0);
      expect(await NodeFSP.lstat(test.file)).toBeDefined();
    },
  );

  it.each([{ invalid: true }, { hardlink: true }, { parent: "missing-parent" }])(
    "blocks incomplete metadata, hardlinks and missing ancestry: %o",
    async (options) => {
      const test = await fixture(options);
      const review = await test.cleanup.review(test.reviewInput);
      expect(review.eligibleCount).toBe(0);
      expect(review.blockedCount).toBe(1);
      expect((await test.cleanup.execute(test.executeInput(review.planId))).items[0]?.status).toBe(
        "blocked",
      );
      expect(test.trashCalls()).toBe(0);
    },
  );

  it("rejects stale snapshots, invented identities, oversized group expansion and expired plans", async () => {
    const test = await fixture();
    await expect(
      test.cleanup.review({ ...test.reviewInput, snapshotId: "stale" }),
    ).rejects.toMatchObject({ reason: "stale-snapshot" });
    await expect(
      test.cleanup.review({ ...test.reviewInput, historyIds: ["/etc/passwd"] }),
    ).rejects.toMatchObject({ reason: "invalid-selection" });
    const review = await test.cleanup.review(test.reviewInput);
    test.expire();
    await expect(test.cleanup.execute(test.executeInput(review.planId))).rejects.toMatchObject({
      reason: "expired-plan",
    });
    const source = test.snapshot!.cleanupFiles![0]!;
    test.replaceSnapshot({
      ...test.snapshot!,
      cleanupFiles: Array.from({ length: 1001 }, (_, index) => ({ ...source, id: String(index) })),
    });
    await expect(
      test.cleanup.review({ snapshotId: "snapshot", historyIds: [], groupIds: [source.groupId!] }),
    ).rejects.toMatchObject({ reason: "invalid-selection" });
    expect(test.trashCalls()).toBe(0);
  });

  it("fails closed when an active session's account identity cannot be resolved", async () => {
    const test = await fixture();
    test.unknownInstanceIds.add("*");
    expect((await test.cleanup.review(test.reviewInput)).blockedCount).toBe(1);
  });

  it("blocks incomplete scans before producing a cleanup plan", async () => {
    const test = await fixture();
    test.replaceSnapshot({ ...test.snapshot!, truncated: true });
    await expect(test.cleanup.review(test.reviewInput)).rejects.toMatchObject({
      reason: "stale-snapshot",
    });
    expect(test.trashCalls()).toBe(0);
  });

  it("protects descendant files when the explicitly related grandparent session is open", async () => {
    const test = await fixture({ family: true, parent: "parent" });
    const review = await test.cleanup.review(test.reviewInput);
    expect(review.eligibleCount).toBe(1);
    test.nativeSessionKeys.add("codex:codex:grandparent");
    expect((await test.cleanup.execute(test.executeInput(review.planId))).items[0]?.status).toBe(
      "blocked",
    );
    expect(test.trashCalls()).toBe(0);
  });

  it("reports partial results without deleting a changed member of a reviewed group", async () => {
    const test = await fixture({ family: true, parent: "parent" });
    const review = await test.cleanup.review({
      ...test.reviewInput,
      historyIds: [],
      groupIds: [test.snapshot!.groups![0]!.id],
    });
    expect(review.eligibleCount).toBe(3);
    await NodeFSP.appendFile(test.file, "new activity\n");
    const result = await test.cleanup.execute({
      ...test.executeInput(review.planId),
      mode: "delete",
      confirmPermanentDelete: true,
    });
    expect(result.items.filter((item) => item.status === "deleted")).toHaveLength(2);
    expect(result.items.filter((item) => item.status === "blocked")).toHaveLength(1);
    expect(result.processedTotals.fileCount).toBe(2);
    expect((await NodeFSP.stat(test.file)).isFile()).toBe(true);
  });
});
