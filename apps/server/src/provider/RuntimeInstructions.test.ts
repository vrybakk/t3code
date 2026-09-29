import { describe, expect, it } from "vite-plus/test";
import { getStudioTaskWorkflow } from "../studio/StudioTaskWorkflow.ts";
import { buildRuntimeInstructions } from "./RuntimeInstructions.ts";

describe("buildRuntimeInstructions", () => {
  it("requires explicit registration of every PR and stack layer", () => {
    const instructions = buildRuntimeInstructions({ harness: "Codex" });
    expect(instructions).toContain("When the t3-code MCP server exposes link_pull_request");
    expect(instructions).toContain("with the full PR URL immediately after creating a PR");
    expect(instructions).toContain("For a stack, call it for every layer");
    expect(instructions).toContain("call list_thread_pull_requests and link any PR");
  });

  it("keeps known model and effort metadata on one line", () => {
    expect(
      buildRuntimeInstructions({
        harness: "Codex",
        model: "  custom\nmodel  ",
        reasoningEffort: " high\n",
      }),
    ).toContain("through the Codex harness, as custom model with high reasoning effort.");
  });

  it("names the model by display name and slug when they differ", () => {
    expect(
      buildRuntimeInstructions({ harness: "Codex", model: "gpt-5.4", modelName: "GPT-5.4" }),
    ).toContain("through the Codex harness, as GPT-5.4 (model slug: gpt-5.4).");
    expect(
      buildRuntimeInstructions({ harness: "Codex", model: "my-model", modelName: "my-model" }),
    ).toContain("through the Codex harness, as my-model.");
  });

  it.each([undefined, "", "auto", "default"])("omits unresolved model %s", (model) => {
    const instructions = buildRuntimeInstructions({ harness: "Cursor", model });
    expect(instructions).toContain("through the Cursor harness.");
    expect(instructions).not.toContain("reasoning effort");
  });
});

it.each(["Codex", "Claude Code", "Cursor", "Grok", "OpenCode", "Antigravity"])(
  "routes the app workflow through T3 tools for %s",
  (harness) => {
    const instructions = buildRuntimeInstructions({ harness });
    expect(instructions).toContain(
      "$studio-task-workflow applies only to Nerd-linked task actions",
    );
    expect(instructions).toContain("Ordinary work needs no task link or Submit");
    expect(instructions).toContain("It is an app-provided workflow");
    expect(instructions).toContain(
      "Load it using get_studio_task_workflow and get_linked_clickup_task",
    );
    expect(instructions).toContain("use Start task to prepare a linked thread");
    expect(instructions).toContain("Ask if the action is ambiguous");
  },
);

it.each(["Codex", "Claude Code", "Cursor", "Grok", "OpenCode", "Antigravity"])(
  "preserves explicit release authority and linked-task selection for %s",
  (harness) => {
    const instructions = buildRuntimeInstructions({ harness });
    expect(instructions).toContain("Implement alone authorizes task-scoped");
    expect(instructions).toContain("not merge or deployment");
    expect(instructions).toContain(
      "A separate explicit developer instruction to merge, release or deploy",
    );
    expect(instructions).toContain("under repository and platform restrictions");
    expect(instructions).toContain("pending Submit does not block it");
    expect(instructions).toContain("Never impersonate Submit");
    expect(instructions).toContain("Submit itself grants no release permission");
    expect(instructions).toContain("Omitting task uses the primary, else the sole linked task");
    expect(instructions).toContain("with multiple links and no primary, ask which task to select");
    expect(instructions).toContain("on every workflow call, including reads and resumes");
  },
);

it.each(["requirements", "estimate", "implement"] as const)(
  "ships the same authority and selection rules in the %s workflow bundle",
  (mode) => {
    const { instructions } = getStudioTaskWorkflow(mode);
    expect(instructions).toContain("otherwise the sole linked task");
    expect(instructions).toContain(
      "If several tasks are linked without a primary, ask which task to use",
    );
    expect(instructions).toContain(
      "pending Submit does not block separately authorized release work",
    );
    expect(instructions).toContain("subject to repository rules and platform permissions");
    expect(instructions).toContain(
      "Neither Implement nor Submit grants release permission by itself",
    );
    expect(instructions).not.toContain("merge/deployment remain with the CTO");
    if (mode === "implement") {
      expect(instructions).toContain("Never call a UI, CLI or other API to impersonate");
      expect(instructions).toContain("independent review");
      expect(instructions).toContain("inspect the actual build, upload and deployment results");
    }
  },
);
