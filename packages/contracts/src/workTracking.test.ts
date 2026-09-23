import { describe, expect, it } from "vite-plus/test";
import * as Schema from "effect/Schema";

import {
  WorkImportInput,
  WorkManualEntryInput,
  WorkOverviewInput,
  WorkProfile,
  WorkTotals,
} from "./workTracking.ts";

describe("work tracking contracts", () => {
  it("validates bounded record pagination and optional summary-only requests", () => {
    const decode = Schema.decodeUnknownSync(WorkOverviewInput);
    const window = { since: "2026-09-01T00:00:00.000Z", until: "2026-10-01T00:00:00.000Z" };
    expect(decode(window)).toEqual(window);
    expect(
      decode({ ...window, recordOffset: 500, recordLimit: 25, includeAdjustments: false }),
    ).toMatchObject({ recordOffset: 500, recordLimit: 25, includeAdjustments: false });
    expect(decode({ ...window, includeRecords: false })).toMatchObject({ includeRecords: false });
    for (const recordLimit of [0, -1, 101, 1.5]) {
      expect(() => decode({ ...window, recordLimit })).toThrow();
    }
    for (const recordOffset of [-1, 1.5]) {
      expect(() => decode({ ...window, recordOffset })).toThrow();
    }
  });

  it("requires a tracking project for manual developer time", () => {
    const decode = Schema.decodeUnknownSync(WorkManualEntryInput);
    expect(() => decode({ occurredAt: "2026-09-20T00:00:00.000Z", durationMs: 60_000 })).toThrow();
  });

  it("requires timezone and explicit tracking state during onboarding", () => {
    const decode = Schema.decodeUnknownSync(WorkProfile);
    expect(() =>
      decode({
        id: "profile",
        displayName: "Developer",
        createdAt: "2026-09-20T00:00:00.000Z",
        updatedAt: "2026-09-20T00:00:00.000Z",
      }),
    ).toThrow();
  });

  it("accepts only explicit merge imports for versioned backups", () => {
    const decode = Schema.decodeUnknownSync(WorkImportInput);
    const backup = {
      version: 1,
      profile: null,
      projects: [],
      records: [],
      deliveries: [],
      reports: [],
    };
    expect(decode({ mode: "merge", backup })).toEqual({ mode: "merge", backup });
    expect(() => decode({ mode: "replace", backup })).toThrow();
  });

  it("requires complete local token and tool-use totals", () => {
    const decode = Schema.decodeUnknownSync(WorkTotals);
    const totals = {
      manualMs: 0,
      agentElapsedMs: 0,
      agentActiveMs: 0,
      agentWaitingMs: 0,
      agentTaskMs: 0,
      inputTokens: 10,
      cachedInputTokens: 2,
      outputTokens: 5,
      reasoningTokens: 3,
      toolUses: 4,
      records: 1,
    };
    expect(decode(totals)).toEqual(totals);
    expect(() => decode({ ...totals, toolUses: undefined })).toThrow();
  });
});
