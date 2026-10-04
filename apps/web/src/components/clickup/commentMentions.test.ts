import { describe, expect, it } from "vite-plus/test";
import type { MarkdownNode } from "~/vendor/mdast-find-and-replace";
import { remarkSelfMentions } from "./commentMentions";

function highlight(children: MarkdownNode[], username: string | undefined) {
  const tree: MarkdownNode = { type: "root", children: [{ type: "paragraph", children }] };
  remarkSelfMentions({ username })(tree);
  return tree.children![0]!.children!;
}

function plainText(nodes: ReadonlyArray<MarkdownNode>): string {
  return nodes.map((node) => node.value ?? plainText(node.children ?? [])).join("");
}

const marks = (nodes: ReadonlyArray<MarkdownNode>) =>
  nodes.filter((node) => node.type === "selfMention").map((node) => plainText([node]));

describe("remarkSelfMentions", () => {
  it("marks repeated self mentions without changing surrounding text or other mentions", () => {
    const text = "@Vladyslav Rybak, ask @Other User.\nThanks (@vladyslav rybak)!";
    const nodes = highlight([{ type: "text", value: text }], "Vladyslav Rybak");
    expect(marks(nodes)).toEqual(["@Vladyslav Rybak", "@vladyslav rybak"]);
    expect(nodes.find((node) => node.type === "selfMention")?.data).toEqual({ hName: "mark" });
    expect(plainText(nodes)).toBe(text);
  });

  it.each([
    "@Vladyslav Rybakov",
    "@Vladyslav Rybak-Smith",
    "email@Vladyslav Rybak",
    "@@Vladyslav Rybak",
    "Vladyslav Rybak",
  ])("does not mark a partial name or non-mention: %s", (text) => {
    expect(marks(highlight([{ type: "text", value: text }], "Vladyslav Rybak"))).toEqual([]);
  });

  it("matches literal punctuation in usernames", () => {
    const nodes = highlight([{ type: "text", value: "Ask @A. User (QA)." }], "A. User (QA)");
    expect(marks(nodes)).toEqual(["@A. User (QA)"]);
  });

  it("leaves links and code alone", () => {
    const nodes = highlight(
      [
        { type: "inlineCode", value: "@Vladyslav Rybak" },
        {
          type: "link",
          url: "https://x.test",
          children: [{ type: "text", value: "@Vladyslav Rybak" }],
        },
      ],
      "Vladyslav Rybak",
    );
    expect(marks(nodes)).toEqual([]);
  });

  it("does nothing without the connected user's name", () => {
    expect(marks(highlight([{ type: "text", value: "@Vladyslav Rybak" }], undefined))).toEqual([]);
  });
});
