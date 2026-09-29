import type { ClickUpTaskDetails, ScopedThreadRef } from "@t3tools/contracts";
import { useComposerDraftStore } from "../../composerDraftStore";
import { buildClickUpTaskPrompt } from "./taskPrompt";

export function prepareLinkedTaskDraft(threadRef: ScopedThreadRef, details: ClickUpTaskDetails) {
  if (details.task.tags?.some((tag) => tag.trim().toLowerCase() === "no agent")) return null;
  const command = `${buildClickUpTaskPrompt(details)}\nUse linked task https://app.clickup.com/t/${encodeURIComponent(details.task.taskId)} in workspace ${details.task.workspaceId} for all workflow calls.`;
  const store = useComposerDraftStore.getState();
  const currentPrompt = store.getComposerDraft(threadRef)?.prompt ?? "";
  const nextPrompt = currentPrompt.includes(command)
    ? currentPrompt
    : currentPrompt.length > 0
      ? `${currentPrompt}\n\n${command}`
      : command;
  store.setPrompt(threadRef, nextPrompt);
  return nextPrompt;
}
