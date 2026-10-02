import { findAndReplaceText, type MarkdownNode } from "~/vendor/mdast-find-and-replace";

function selfMentionPattern(username: string | undefined): RegExp | null {
  const name = username?.trim();
  if (!name) return null;
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<![\\p{L}\\p{N}_@])@${escapedName}(?![\\p{L}\\p{N}_'’-])`, "giu");
}

const MENTION_IGNORED_TYPES = new Set(["link", "linkReference", "inlineCode", "code"]);

/** Wraps the reader's own `@name` in a `mark` when a comment is rendered as markdown. */
export function remarkSelfMentions(options: { readonly username: string | undefined }) {
  const pattern = selfMentionPattern(options.username);
  return (tree: MarkdownNode) => {
    if (!pattern) return;
    findAndReplaceText(
      tree,
      pattern,
      (matched) => ({
        type: "selfMention",
        data: { hName: "mark" },
        children: [{ type: "text", value: matched }],
      }),
      MENTION_IGNORED_TYPES,
    );
  };
}
