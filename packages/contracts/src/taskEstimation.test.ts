import { describe, expect, it } from "vite-plus/test";
import * as Schema from "effect/Schema";
import { TaskEstimationFinalResponse, TaskEstimationResponse } from "./taskEstimation.ts";

const response = {
  summary: "Adjust the existing renderer and verify related pages.",
  searches: [],
  files: [],
  estimate: {
    implementationMinutes: 4,
    verificationMinutes: 12,
    followUpMinutes: 0,
    confidence: "medium",
    blockers: [],
  },
};
describe("task estimation phases", () => {
  it("accepts a completed estimate", () => {
    expect(
      Schema.decodeUnknownSync(TaskEstimationFinalResponse)(response).estimate
        ?.implementationMinutes,
    ).toBe(4);
  });
  it.each(["searches", "files"] as const)(
    "allows %s during research but rejects it in a final estimate",
    (field) => {
      const pending = { ...response, [field]: [{ repository: 0, value: "src/product.ts" }] };
      expect(() => Schema.decodeUnknownSync(TaskEstimationResponse)(pending)).not.toThrow();
      expect(() => Schema.decodeUnknownSync(TaskEstimationFinalResponse)(pending)).toThrow();
    },
  );
});
