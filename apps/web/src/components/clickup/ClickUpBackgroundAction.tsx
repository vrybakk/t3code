import type { ClickUpAnalyzeTaskInput, EnvironmentId } from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import { useEffect, useRef, useState } from "react";
import { serverEnvironment } from "../../state/server";
import { useAtomCommand } from "../../state/use-atom-command";
import { ClickUpAnalysisContent } from "./ClickUpAnalysisContent";
import { publishTaskAnalysisNotification, type AnalysisState } from "./taskAnalysisFeedback";

// Keep an action and its result available when its dialog is closed and reopened.
const runs = new Map<string, { promise: Promise<AnalysisState>; settled: boolean }>();

export function ClickUpBackgroundAction({
  environmentId,
  input,
  taskName,
  listName,
  onClose,
}: {
  environmentId: EnvironmentId;
  input: ClickUpAnalyzeTaskInput;
  taskName: string;
  listName?: string | undefined;
  onClose: () => void;
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
        const state = { result, error: null };
        publishTaskAnalysisNotification({ environmentId, input, taskName, state });
        return state;
      }
      const cause = Cause.squash(response.cause);
      const error =
        cause instanceof Error
          ? cause.message
          : "Task analysis could not be confirmed. Refresh the task before retrying.";
      const state = { result: null, error };
      publishTaskAnalysisNotification({ environmentId, input, taskName, state });
      return state;
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
  return (
    <ClickUpAnalysisContent
      action={input.action}
      taskName={taskName}
      listName={listName}
      state={state}
      onClose={onClose}
      onRetry={() => {
        setState(null);
        void run(true).then(setState);
      }}
    />
  );
}
