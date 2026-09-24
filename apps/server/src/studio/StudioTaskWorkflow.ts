import workflow from "./StudioTaskWorkflow.generated.json" with { type: "json" };

const { bundle: STUDIO_WORKFLOW_BUNDLE, version: STUDIO_WORKFLOW_VERSION } = workflow;

export function getStudioTaskWorkflow(mode: "requirements" | "estimate" | "implement") {
  const shared = [STUDIO_WORKFLOW_BUNDLE.skill, STUDIO_WORKFLOW_BUNDLE.coordination];
  const references =
    mode === "implement"
      ? [STUDIO_WORKFLOW_BUNDLE.verification, STUDIO_WORKFLOW_BUNDLE.communication]
      : mode === "requirements"
        ? [STUDIO_WORKFLOW_BUNDLE.communication]
        : [];
  return {
    version: STUDIO_WORKFLOW_VERSION,
    mode,
    instructions: [...shared, STUDIO_WORKFLOW_BUNDLE[mode], ...references].join("\n\n"),
  };
}
