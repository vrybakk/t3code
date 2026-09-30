import type { ClickUpAnalyzeTaskInput, EnvironmentId } from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import { useCallback, useSyncExternalStore } from "react";
import { serverEnvironment } from "../../state/server";
import { useAtomCommand } from "../../state/use-atom-command";
import { publishTaskAnalysisNotification, type AnalysisState } from "./taskAnalysisFeedback";

// Runs survive navigation and share progress between the task row and dialog.
const runs = new Map<string, { promise: Promise<AnalysisState>; state: AnalysisState | null }>();
const listeners = new Set<() => void>();
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
function notify() {
  for (const listener of listeners) listener();
}

export function useClickUpBackgroundAction({
  environmentId,
  input,
  taskName,
}: {
  environmentId: EnvironmentId;
  input: ClickUpAnalyzeTaskInput;
  taskName: string;
}) {
  const analyze = useAtomCommand(serverEnvironment.clickUpAnalyzeTask, { reportFailure: false });
  const { userId, workspaceId, taskId, action } = input;
  const key = JSON.stringify([environmentId, userId, workspaceId, taskId, action]);
  const state = useSyncExternalStore(subscribe, () => runs.get(key)?.state);
  const run = useCallback(
    (again = false) => {
      const previous = runs.get(key);
      if (previous && (!again || previous.state === null)) return previous.promise;
      const input = { userId, workspaceId, taskId, action };
      const promise = analyze({ environmentId, input }).then((response): AnalysisState => {
        if (response._tag === "Success") return { result: response.value, error: null };
        const cause = Cause.squash(response.cause);
        return {
          result: null,
          error:
            cause instanceof Error
              ? cause.message
              : "Task analysis could not be confirmed. Refresh the task before retrying.",
        };
      });
      const entry = { promise, state: null as AnalysisState | null };
      runs.set(key, entry);
      notify();
      void promise.then((state) => {
        entry.state = state;
        notify();
        publishTaskAnalysisNotification({ environmentId, input, taskName, state });
      });
      return promise;
    },
    [analyze, environmentId, userId, workspaceId, taskId, action, key, taskName],
  );
  return { state, run };
}
