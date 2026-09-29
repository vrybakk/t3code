import { describe, expect, it } from "vite-plus/test";
import { createEstimationEvidence } from "./ClickUpEstimationEvidence.ts";

describe("estimation evidence", () => {
  it("merges overlapping lines without duplicates or changing their positions", () => {
    const evidence = createEstimationEvidence();
    evidence.add(0, "checkout.ts", "two\nthree\nfour\n", 2, 4);
    evidence.add(0, "checkout.ts", "one\ntwo\nthree\n", 1, 3);
    evidence.add(0, "checkout.ts", "four\nfive", 4, 5);
    expect(evidence.files.get("0:checkout.ts")?.excerpts).toEqual([
      { contents: "one\ntwo\nthree\nfour\nfive", startLine: 1, endLine: 5 },
    ]);
    expect(evidence.characters).toBe("one\ntwo\nthree\nfour\nfive".length);
  });

  it("keeps gaps and repository identities distinct", () => {
    const evidence = createEstimationEvidence();
    evidence.add(0, "checkout.ts", "one", 1, 1);
    evidence.add(0, "checkout.ts", "four", 4, 4);
    evidence.add(1, "checkout.ts", "another repository", 1, 1);
    expect(evidence.files.get("0:checkout.ts")?.excerpts).toEqual([
      { contents: "one", startLine: 1, endLine: 1 },
      { contents: "four", startLine: 4, endLine: 4 },
    ]);
    expect(evidence.files.size).toBe(2);
  });

  it("evicts the oldest file at the file limit and honors explicit touches", () => {
    const evidence = createEstimationEvidence();
    for (let index = 0; index < 24; index++) evidence.add(0, `${index}.ts`, "source", 1, 1);
    evidence.touch("0:0.ts");
    const result = evidence.add(0, "24.ts", "new source", 1, 1);
    expect(result.evicted).toEqual(["0:1.ts"]);
    expect(evidence.files.has("0:0.ts")).toBe(true);
    expect(evidence.files.size).toBe(24);
  });

  it("evicts old evidence when new relevant evidence needs the character budget", () => {
    const evidence = createEstimationEvidence();
    for (let index = 0; index < 20; index++)
      evidence.add(0, `${index}.ts`, "x".repeat(6_000), 1, 1);
    expect(evidence.characters).toBe(120_000);
    const result = evidence.add(0, "target.ts", "important", 1, 1);
    expect(result.evicted).toEqual(["0:0.ts"]);
    expect(evidence.characters).toBe(114_009);
    expect(evidence.files.has("0:target.ts")).toBe(true);
  });

  it("does not report progress for already-covered reads, but refreshes their priority", () => {
    const evidence = createEstimationEvidence();
    evidence.add(0, "target.ts", "one\ntwo", 1, 2);
    const revision = evidence.revision;
    evidence.add(0, "other.ts", "other", 1, 1);
    expect(evidence.add(0, "target.ts", "two", 2, 2)).toEqual({
      changed: false,
      evicted: [],
    });
    evidence.touch("0:target.ts");
    expect(evidence.revision).toBe(revision + 1);
    expect([...evidence.files.keys()]).toEqual(["0:other.ts", "0:target.ts"]);
  });

  it("keeps partial lines incomplete until their full content is inspected", () => {
    const evidence = createEstimationEvidence();
    evidence.add(0, "target.ts", "first\npar", 1, 1);
    expect(evidence.files.get("0:target.ts")?.excerpts).toEqual([
      { contents: "first", startLine: 1, endLine: 1 },
      { contents: "par", startLine: 2, endLine: 1 },
    ]);
    expect(evidence.add(0, "target.ts", "par", 2, 1).changed).toBe(false);
    evidence.add(0, "target.ts", "partial line\nlast", 2, 3);
    expect(evidence.files.get("0:target.ts")?.excerpts).toEqual([
      { contents: "first\npartial line\nlast", startLine: 1, endLine: 3 },
    ]);
  });

  it("retains the longest partial prefix without pretending its line is complete", () => {
    const evidence = createEstimationEvidence();
    evidence.add(0, "target.ts", "prefix", 10, 9);
    evidence.add(0, "target.ts", "prefix grows", 10, 9);
    expect(evidence.add(0, "target.ts", "prefix", 10, 9).changed).toBe(false);
    expect(evidence.files.get("0:target.ts")?.excerpts).toEqual([
      { contents: "prefix grows", startLine: 10, endLine: 9 },
    ]);
  });

  it("preserves empty complete lines and the positions around them", () => {
    const evidence = createEstimationEvidence();
    evidence.add(0, "target.ts", "\n\nthird\n", 1, 3);
    evidence.add(0, "target.ts", "third\nfourth", 3, 4);
    expect(evidence.files.get("0:target.ts")?.excerpts).toEqual([
      { contents: "\n\nthird\nfourth", startLine: 1, endLine: 4 },
    ]);
  });

  it("can replace one file's oversized history while retaining its latest focused window", () => {
    const evidence = createEstimationEvidence();
    for (let index = 0; index < 20; index++)
      evidence.add(0, "large.ts", "x".repeat(6_000), index * 2 + 1, index * 2 + 1);
    const result = evidence.add(0, "large.ts", "new focus", 100, 100);
    expect(result.evicted).toEqual(["0:large.ts"]);
    expect(evidence.characters).toBe(9);
    expect(evidence.files.get("0:large.ts")?.excerpts).toEqual([
      { contents: "new focus", startLine: 100, endLine: 100 },
    ]);
  });
});
