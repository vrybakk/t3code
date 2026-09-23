import { describe, expect, it } from "vite-plus/test";
import * as Schema from "effect/Schema";
import { StorageUsageInput, StorageUsageResult } from "./storageUsage.ts";

const decodeReport = Schema.decodeUnknownSync(StorageUsageResult);

describe("storage usage contract", () => {
  const decode = Schema.decodeUnknownSync(StorageUsageInput);
  const input = { refresh: false, search: "", offset: 0, limit: 25 };

  it("bounds page requests and search input", () => {
    expect(decode(input)).toEqual(input);
    for (const invalid of [
      { offset: -1 },
      { offset: 0.5 },
      { limit: 0 },
      { limit: 101 },
      { search: "x".repeat(201) },
    ]) {
      expect(() => decode({ ...input, ...invalid })).toThrow();
    }
  });

  it("represents unknown allocation and incomplete measurements without inventing zero bytes", () => {
    const report = decodeReport({
      scannedAt: "2026-09-23T12:00:00.000Z",
      scanDurationMs: 5,
      totals: { logicalBytes: 1000, allocatedBytes: null, fileCount: 1 },
      categories: [],
      histories: [],
      totalHistories: 0,
      matchedHistories: 0,
      warnings: ["Scan reached its file limit."],
      truncated: true,
    });
    expect(report.totals.allocatedBytes).toBeNull();
    expect(report.truncated).toBe(true);
  });
});
