import { describe, expect, it } from "vite-plus/test";
import * as Schema from "effect/Schema";
import { TaskAnalysis } from "./clickupWorkflow.ts";

const decodeAnalysis = Schema.decodeUnknownSync(TaskAnalysis);
const analysis = (findings: string | null) => ({
  summary: "Task context review",
  estimateMinutes: null,
  findings,
});

describe("task analysis findings", () => {
  it.each([
    null,
    "I need the expected image.",
    "I need the URL.\nI need the target page.\nI need the slide number.\nI need the expected result.",
  ])("accepts valid findings: %s", (findings) => {
    expect(decodeAnalysis(analysis(findings)).findings).toEqual(findings);
  });

  it.each([
    "We need the image.",
    "Send us the URL.",
    "Our target is unclear.",
    "I need `the URL`.",
    "I need details — the URL.",
    "I need details – the URL.",
    "I need one.\nTwo.\nThree.\nFour.\nFive.",
    "   ",
    "x".repeat(2001),
  ])("rejects invalid findings: %s", (findings) => {
    expect(() => decodeAnalysis(analysis(findings))).toThrow();
  });
});
