import { describe, expect, it } from "vite-plus/test";

import {
  formatLocalDateTime,
  localDateTimeToIso,
  parseDurationMinutes,
  workReportActions,
} from "./workTracking.ts";

describe("parseDurationMinutes", () => {
  it("rejects negative and non-finite manual duration", () => {
    expect(parseDurationMinutes("")).toBeNull();
    expect(parseDurationMinutes("   ")).toBeNull();
    expect(parseDurationMinutes("-1")).toBeNull();
    expect(parseDurationMinutes("NaN")).toBeNull();
    expect(parseDurationMinutes("Infinity")).toBeNull();
  });

  it("converts non-negative minutes to milliseconds", () => {
    expect(parseDurationMinutes("1.5")).toBe(90_000);
    expect(parseDurationMinutes("0")).toBe(0);
  });
});

describe("local date time helpers", () => {
  it("round-trips a datetime-local value through the local wall clock", () => {
    const value = "2026-09-20T14:30";
    expect(formatLocalDateTime(localDateTimeToIso(value)!)).toBe(value);
  });

  it("rejects invalid local wall-clock values instead of silently rolling them over", () => {
    expect(localDateTimeToIso("2026-02-30T14:30")).toBeNull();
    expect(localDateTimeToIso("2026-09-20T14:30:00Z")).toBeNull();
  });
});

describe("workReportActions", () => {
  it("only exposes legal report lifecycle transitions", () => {
    expect(workReportActions("open")).toEqual(["submitted"]);
    expect(workReportActions("submitted")).toEqual(["open", "invoiced"]);
    expect(workReportActions("invoiced")).toEqual([]);
  });
});
