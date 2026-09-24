export function splitSelfMentions(text: string, username: string | undefined) {
  const name = username?.trim();
  if (!name) return [{ text, isMention: false, offset: 0 }];
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`(?<![\\p{L}\\p{N}_@])@${escapedName}(?![\\p{L}\\p{N}_'’-])`, "giu");
  const parts: Array<{ text: string; isMention: boolean; offset: number }> = [];
  let end = 0;
  for (const match of text.matchAll(pattern)) {
    if (match.index > end)
      parts.push({ text: text.slice(end, match.index), isMention: false, offset: end });
    parts.push({ text: match[0], isMention: true, offset: match.index });
    end = match.index + match[0].length;
  }
  if (end < text.length) parts.push({ text: text.slice(end), isMention: false, offset: end });
  return parts;
}
