import { describe, expect, it } from "vite-plus/test";

import { encodeCsvCell, encodeCsvRow } from "./WorkTrackingCsv.ts";

describe("WorkTrackingCsv", () => {
  it("quotes cells and neutralizes spreadsheet formulas", () => {
    expect(encodeCsvRow(["=SUM(A1:A2)", "+1", "-1", "@value", "\ttab", "\rreturn"])).toBe(
      `"'=SUM(A1:A2)","'+1","'-1","'@value","'\ttab","'\rreturn"`,
    );
    expect(encodeCsvCell('say "hello"')).toBe('"say ""hello"""');
  });
});
