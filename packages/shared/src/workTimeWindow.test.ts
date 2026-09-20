// @effect-diagnostics globalDate:off -- Fixed instants make timezone boundary tests deterministic.
import { describe, expect, it } from "vite-plus/test";

import { workTimeWindow } from "./workTimeWindow.ts";

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
