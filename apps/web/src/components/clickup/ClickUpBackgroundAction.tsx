import type {
  ClickUpAnalyzeTaskInput,
  ClickUpTaskAnalysis,
  EnvironmentId,
} from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import { useEffect, useRef, useState } from "react";
import { serverEnvironment } from "../../state/server";
import { useAtomCommand } from "../../state/use-atom-command";
import { Button } from "../ui/button";
import { toastManager } from "../ui/toast";

interface AnalysisState {
  result: ClickUpTaskAnalysis | null;
  error: string | null;
}

// Keep an action and its result available when its dialog is closed and reopened.
const runs = new Map<string, { promise: Promise<AnalysisState>; settled: boolean }>();

export function ClickUpBackgroundAction({
  environmentId,
  input,
  taskName,
}: {
  environmentId: EnvironmentId;
  input: ClickUpAnalyzeTaskInput;
  taskName: string;
}) {
  const analyze = useAtomCommand(serverEnvironment.clickUpAnalyzeTask, { reportFailure: false });
  const started = useRef(false);
  const [state, setState] = useState<AnalysisState | null>(null);
  const key = JSON.stringify([
    environmentId,
    input.userId,
    input.workspaceId,
    input.taskId,
    input.action,
  ]);
  function run(again = false) {
    const previous = runs.get(key);
    if (previous && (!again || !previous.settled)) return previous.promise;
    const promise = analyze({ environmentId, input }).then((response): AnalysisState => {
      if (response._tag === "Success") {
        const result = response.value;
        toastManager.add({ title: taskName, description: result.summary, type: "success" });
        return { result, error: null };
      }
      const cause = Cause.squash(response.cause);
      const error =
        cause instanceof Error
          ? cause.message
          : "Task analysis could not be confirmed. Refresh the task before retrying.";
      toastManager.add({ title: "Task analysis failed", description: error, type: "error" });
      return { result: null, error };
    });
    const entry = { promise, settled: false };
    runs.set(key, entry);
    void promise.then(() => {
      entry.settled = true;
    });
    return promise;
  }
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void run().then(setState);
  });
  const result = state?.result;
  const error = state?.error;
  return (
    <div className="space-y-2 text-sm">
      <p className="text-xs text-muted-foreground">
        Uses your default text-generation model and the supplied task context. Code and attachment
        contents are not inspected.
      </p>
      {error ? (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      ) : result ? (
        <div role="status" className="space-y-2 whitespace-pre-wrap">
          <p>{result.summary}</p>
          {result.estimateSaved && <p>Saved estimate: {result.estimateMinutes} minutes.</p>}
          {result.estimateSaved && !result.tagRemoved && (
            <p>The estimate was saved, but the estimation tag could not be removed.</p>
          )}
          {result.findingsPosted && <p>Findings posted to ClickUp.</p>}
          {result.findings && <p>{result.findings}</p>}
        </div>
      ) : (
        <p role="status">Running in the background… You can close this dialog.</p>
      )}
      {state && (
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setState(null);
            void run(true).then(setState);
          }}
        >
          Run again
        </Button>
      )}
    </div>
  );
}
