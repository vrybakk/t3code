import { describe, expect, it } from "vite-plus/test";
import { buildClickUpTaskPrompt, safeClickUpAttachmentUrl } from "./taskPrompt";

describe("ClickUp task context", () => {
  it("carries task identity, requirements and verification limitations into the prepared draft", () => {
    const prompt = buildClickUpTaskPrompt({
      task: {
        taskId: "abc",
        workspaceId: "42",
        name: "Checkout fix",
        status: "open",
        listName: "Sprint",
        description: "Handle an empty cart.",
      },
      comments: [{ id: "c1", author: "Reviewer", text: "Verify the mobile layout." }],
      commentsMayHaveMore: true,
      attachments: [{ name: "Recording", url: "https://attachments.example.test/video.mp4" }],
    });
    expect(prompt).toContain("Task ID: abc; workspace: 42");
    expect(prompt).toContain("Handle an empty cart.");
    expect(prompt).toContain("Reviewer: Verify the mobile layout.");
    expect(prompt).toContain("replies and older comments may not be included");
    expect(prompt).toContain("these links are not their contents");
    expect(prompt).toContain("request explicit approval before proceeding without it");
  });

  it("only renders HTTPS attachment links", () => {
    expect(safeClickUpAttachmentUrl("javascript:alert(1)")).toBeNull();
    expect(safeClickUpAttachmentUrl("file:///private/file")).toBeNull();
    expect(safeClickUpAttachmentUrl("broken")).toBeNull();
    expect(safeClickUpAttachmentUrl("https://attachments.example.test/a.pdf")).toBe(
      "https://attachments.example.test/a.pdf",
    );
  });
});
