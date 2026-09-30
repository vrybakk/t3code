import type { ClickUpAnalyzeTaskInput, EnvironmentId } from "@t3tools/contracts";
import { useEffect } from "react";
import { ClickUpAnalysisContent } from "./ClickUpAnalysisContent";
import { useClickUpBackgroundAction } from "./useClickUpBackgroundAction";

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
  const { state, run } = useClickUpBackgroundAction({ environmentId, input, taskName });
  useEffect(() => {
    void run();
  }, [run]);
  return (
    <ClickUpAnalysisContent
      action={input.action}
      taskName={taskName}
      listName={listName}
      state={state ?? null}
      onClose={onClose}
      onRetry={() => {
        void run(true);
      }}
    />
  );
}
