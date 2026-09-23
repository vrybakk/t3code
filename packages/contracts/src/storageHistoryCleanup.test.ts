import { describe, expect, it } from "vite-plus/test";
import * as Schema from "effect/Schema";
import { StorageCleanupReviewInput, StorageCleanupExecuteInput } from "./storageHistoryCleanup.ts";

describe("native history cleanup contracts", () => {
  it("bounds opaque cleanup selections", () => {
    const decode = Schema.decodeUnknownSync(StorageCleanupReviewInput);
    expect(decode({ snapshotId: "scan", historyIds: ["history"], groupIds: [] })).toMatchObject({
      snapshotId: "scan",
    });
    for (const key of ["historyIds", "groupIds"])
      expect(() =>
        decode({ snapshotId: "scan", historyIds: [], groupIds: [], [key]: Array(1001).fill("id") }),
      ).toThrow();
  });

  it("requires explicit acknowledgement fields and a supported cleanup mode", () => {
    const decode = Schema.decodeUnknownSync(StorageCleanupExecuteInput);
    const input = {
      planId: "review",
      mode: "trash",
      acknowledgeExternalSessionsStopped: true,
      acknowledgeHistoryLoss: true,
      confirmPermanentDelete: false,
    };
    expect(decode(input)).toEqual(input);
    expect(() => decode({ planId: "review", mode: "delete" })).toThrow();
    expect(() => decode({ ...input, mode: "auto" })).toThrow();
  });
});
