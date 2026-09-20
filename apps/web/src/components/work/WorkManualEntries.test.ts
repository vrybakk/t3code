import { describe, expect, it } from "vite-plus/test";

import { isValidWorkMonth } from "./WorkManualEntries.tsx";

describe("isValidWorkMonth", () => {
  it("rejects a cleared or invalid month value", () => {
    expect(isValidWorkMonth("")).toBe(false);
    expect(isValidWorkMonth("2026-13")).toBe(false);
    expect(isValidWorkMonth("2026-09")).toBe(true);
  });
});
