import type { ThreadClickUpTaskLink, ThreadClickUpTaskLinkUpdate } from "@t3tools/contracts";

export function updateThreadTaskLinks(
  links: ReadonlyArray<ThreadClickUpTaskLink>,
  update: ThreadClickUpTaskLinkUpdate,
): ReadonlyArray<ThreadClickUpTaskLink> {
  const key = update.type === "link" ? update.task : update;
  const matches = (link: ThreadClickUpTaskLink) =>
    link.workspaceId === key.workspaceId && link.taskId === key.taskId;
  if (update.type === "link") {
    if (links.some(matches)) return links;
    return [...links, { ...update.task, primary: links.length === 0 }];
  }
  const removed = links.find(matches);
  if (!removed) return links;
  const remaining = links.filter((link) => !matches(link));
  return removed.primary
    ? remaining.map((link, index) => ({ ...link, primary: index === 0 }))
    : remaining;
}
