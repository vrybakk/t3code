import { describe, expect, it } from "vite-plus/test";
import * as Schema from "effect/Schema";

import { WorkImportInput, WorkManualEntryInput, WorkProfile } from "./workTracking.ts";

describe("work tracking contracts", () => {
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
});
