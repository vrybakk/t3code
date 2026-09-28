import { ComposerContextId, type TaskContextRecord } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";
import { newTaskLinksFromMessage, referencedTaskContexts } from "./composerTaskContext.ts";
import { projectComposerContextForProvider } from "./composerContextReferences.ts";

const task = (id: string): TaskContextRecord => ({
  version: 1,
  kind: "task",
  contextId: ComposerContextId.make(`task_${id}`),
  label: `Task ${id}`,
  name: `Task ${id}`,
  workspaceId: "42",
  taskId: id,
});
const a = task("a"),
  b = task("b");
const text = "Discuss [A](t3-context://v1/task/task_a) and [B](t3-context://v1/task/task_b)";

describe("task context", () => {
  it("selects only referenced tasks, in mention order, without duplicates", () => {
    expect(
      referencedTaskContexts(`${text} [again](t3-context://v1/task/task_a)`, [
        b,
        a,
        task("unused"),
      ]),
    ).toEqual([a, b]);
    expect(referencedTaskContexts("Removed the chips", [a, b])).toEqual([]);
  });
  it("gives a custom session its first primary and preserves an existing primary", () => {
    const links = newTaskLinksFromMessage(text, [a, b], []);
    expect(links.map((link) => link.primary)).toEqual([true, false]);
    expect(newTaskLinksFromMessage(text, [a, b], links)).toEqual([]);
    expect(newTaskLinksFromMessage(text, [a, b], [{ ...b, primary: true }])).toEqual([
      { workspaceId: "42", taskId: "a", name: "Task a", primary: false },
    ]);
  });
  it("promotes an existing context task when the custom session has no primary", () => {
    expect(
      newTaskLinksFromMessage(text, [a, b], [{ ...a, primary: false }]).map((link) => link.primary),
    ).toEqual([true, false]);
  });
  it("provides task identity and a readable URL without starting a workflow", () => {
    const projected = projectComposerContextForProvider({ text, records: [a, b] });
    expect(projected).toContain("workspaceId: 42");
    expect(projected).toContain("https://app.clickup.com/t/a");
    expect(projected).not.toContain("studio-task-workflow");
  });
});
