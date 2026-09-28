import type {
  ClickUpAnalyzeTaskInput,
  ClickUpTaskAnalysis,
  EnvironmentId,
} from "@t3tools/contracts";

export type AnalysisState =
  | { result: ClickUpTaskAnalysis; error: null }
  | { result: null; error: string };

export function taskAnalysisFeedback(
  action: ClickUpAnalyzeTaskInput["action"],
  state: AnalysisState,
) {
  if (state.error !== null)
    return {
      title: action === "estimate" ? "Estimation failed" : "Requirements check failed",
      type: "error" as const,
    };
  const result = state.result;
  if (action === "estimate") {
    if (result.estimateSaved)
      return {
        title: `Estimate saved · ${result.estimateMinutes} min`,
        type: result.tagRemoved ? ("success" as const) : ("warning" as const),
      };
    return { title: "Estimation complete", type: "success" as const };
  }
  return {
    title: result.findingsPosted ? "Requirements findings posted" : "Requirements checked",
    type: "success" as const,
  };
}

interface TaskAnalysisNotification {
  environmentId: EnvironmentId;
  input: ClickUpAnalyzeTaskInput;
  taskName: string;
  state: AnalysisState;
}
const listeners = new Set<(event: TaskAnalysisNotification) => void>();
export function publishTaskAnalysisNotification(event: TaskAnalysisNotification) {
  for (const listener of listeners) listener(event);
}
export function subscribeTaskAnalysisNotifications(
  listener: (event: TaskAnalysisNotification) => void,
) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
