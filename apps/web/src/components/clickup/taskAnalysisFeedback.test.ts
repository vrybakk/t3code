import { expect, it } from "vite-plus/test";
import { taskAnalysisFeedback } from "./taskAnalysisFeedback";
const result = {
  summary: "",
  estimateMinutes: null,
  estimateSaved: false,
  tagRemoved: false,
  findings: null,
  findingsPosted: false,
};
it.each(["Existing estimate preserved.", "I need the expected behavior to estimate this task."])(
  "does not claim an estimate was saved: %s",
  (summary) => {
    expect(
      taskAnalysisFeedback("estimate", { error: null, result: { ...result, summary } }),
    ).toEqual({ title: "Estimation complete", type: "success" });
  },
);
it("distinguishes a saved estimate with incomplete tag cleanup", () => {
  expect(
    taskAnalysisFeedback("estimate", {
      error: null,
      result: { ...result, estimateSaved: true, estimateMinutes: 45 },
    }),
  ).toEqual({ title: "Estimate saved · 45 min", type: "warning" });
});
it("only announces posted findings when posting is confirmed", () => {
  expect(taskAnalysisFeedback("requirements", { error: null, result }).title).toBe(
    "Requirements checked",
  );
  expect(
    taskAnalysisFeedback("requirements", {
      error: null,
      result: { ...result, findingsPosted: true },
    }).title,
  ).toBe("Requirements findings posted");
});
