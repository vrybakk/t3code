import { describe, expect, it } from "vite-plus/test";
import { buildClickUpTaskPrompt, safeClickUpAttachmentUrl } from "./taskPrompt";

describe("ClickUp task context", () => {
  it("references the workflow and linked task without copying task materials", () => {
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
    expect(prompt).toBe("$studio-task-workflow Start task: Checkout fix");
    expect(prompt).not.toContain("Handle an empty cart.");
    expect(prompt).not.toContain("Verify the mobile layout.");
    expect(prompt).not.toContain("attachments.example.test");
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
