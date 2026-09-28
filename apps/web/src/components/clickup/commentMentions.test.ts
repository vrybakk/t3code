import { describe, expect, it } from "vite-plus/test";
import { splitSelfMentions } from "./commentMentions";

describe("splitSelfMentions", () => {
  it("finds repeated self mentions without changing surrounding text or other mentions", () => {
    const text = "@Vladyslav Rybak, ask @Other User.\nThanks (@vladyslav rybak)!";
    const parts = splitSelfMentions(text, "Vladyslav Rybak");
    expect(parts.filter((part) => part.isMention).map((part) => part.text)).toEqual([
      "@Vladyslav Rybak",
      "@vladyslav rybak",
    ]);
    expect(parts.map((part) => part.text).join("")).toBe(text);
  });

  it.each([
    "@Vladyslav Rybakov",
    "@Vladyslav Rybak-Smith",
    "email@Vladyslav Rybak",
    "@@Vladyslav Rybak",
    "Vladyslav Rybak",
  ])("does not highlight a partial name or non-mention: %s", (text) => {
    expect(splitSelfMentions(text, "Vladyslav Rybak")).toEqual([
      { text, isMention: false, offset: 0 },
    ]);
  });

  it("matches literal punctuation in usernames", () => {
    const text = "Ask @A. User (QA).";
    expect(splitSelfMentions(text, "A. User (QA)").filter((part) => part.isMention)).toEqual([
      { text: "@A. User (QA)", isMention: true, offset: 4 },
    ]);
  });

  it("does not highlight without the connected user's name", () => {
    expect(splitSelfMentions("@Vladyslav Rybak", undefined)).toEqual([
      { text: "@Vladyslav Rybak", isMention: false, offset: 0 },
    ]);
  });
});
