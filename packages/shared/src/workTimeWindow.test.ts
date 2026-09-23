// @effect-diagnostics globalDate:off -- Fixed instants make timezone boundary tests deterministic.
import { describe, expect, it } from "vite-plus/test";

import { workDateRange, workTimeWindow } from "./workTimeWindow.ts";

describe("workDateRange", () => {
  it("includes the through date and preserves daylight saving boundaries", () => {
    expect(workDateRange("2026-03-28", "2026-03-29", "Europe/Madrid")).toEqual({
      since: "2026-03-27T23:00:00.000Z",
      until: "2026-03-29T22:00:00.000Z",
    });
  });
  it("does not shift the requested date in a UTC+14 environment", () => {
    expect(workDateRange("2026-09-23", "2026-09-23", "Pacific/Kiritimati")).toEqual({
      since: "2026-09-22T10:00:00.000Z",
      until: "2026-09-23T10:00:00.000Z",
    });
  });
  it("rejects cleared, invalid and reversed dates", () => {
    expect(workDateRange("", "2026-09-23", "UTC")).toBeNull();
    expect(workDateRange("2026-02-30", "2026-09-23", "UTC")).toBeNull();
    expect(workDateRange("2026-09-24", "2026-09-23", "UTC")).toBeNull();
  });
});

describe("workTimeWindow", () => {
  it("uses profile calendar boundaries instead of UTC", () => {
    const now = new Date("2026-01-01T01:00:00.000Z");
    expect(workTimeWindow("today", "America/Los_Angeles", now)).toEqual({
      since: "2025-12-31T08:00:00.000Z",
      until: "2026-01-01T08:00:00.000Z",
    });
  });

  it("uses Monday week boundaries across daylight saving time", () => {
    const now = new Date("2026-03-11T12:00:00.000Z");
    expect(workTimeWindow("week", "America/New_York", now)).toEqual({
      since: "2026-03-09T04:00:00.000Z",
      until: "2026-03-16T04:00:00.000Z",
    });
  });

  it("uses the first real instant when Santiago skips local midnight", () => {
    const now = new Date("2026-09-06T12:00:00.000Z");
    expect(workTimeWindow("today", "America/Santiago", now)).toEqual({
      since: "2026-09-06T04:00:00.000Z",
      until: "2026-09-07T03:00:00.000Z",
    });
  });
});
