import type { ClickUpAnalyzeTaskInput } from "@t3tools/contracts";
import { CircleCheckIcon, CircleAlertIcon, FileTextIcon } from "lucide-react";
import { Button } from "../ui/button";
import { Spinner } from "../ui/spinner";
import {
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogPanel,
  DialogFooter,
} from "../ui/dialog";
import { taskAnalysisFeedback, type AnalysisState } from "./taskAnalysisFeedback";

export function ClickUpAnalysisContent({
  action,
  taskName,
  listName,
  state,
  onClose,
  onRetry,
}: {
  action: ClickUpAnalyzeTaskInput["action"];
  taskName: string;
  listName?: string | undefined;
  state: AnalysisState | null;
  onClose: () => void;
  onRetry: () => void;
}) {
  const result = state?.result;
  const error = state?.error;
  const feedback = state ? taskAnalysisFeedback(action, state) : null;
  return (
    <>
      <DialogHeader>
        <DialogTitle aria-live="polite">
          <span className="flex items-center gap-2">
            {!state ? (
              <Spinner size="lg" aria-hidden role="presentation" />
            ) : feedback?.type === "success" ? (
              <CircleCheckIcon aria-hidden className="size-5 text-success-foreground" />
            ) : (
              <CircleAlertIcon aria-hidden className="size-5 text-warning-foreground" />
            )}
            {feedback?.title ?? (action === "estimate" ? "Estimating…" : "Checking requirements…")}
          </span>
        </DialogTitle>
        <DialogDescription>
          {action === "estimate"
            ? result?.estimationEvidence
              ? "AI-assisted implementation and verification, based on the inspected code and task evidence."
              : "Estimates AI-assisted work using your default text-generation model."
            : "Based on the task description and comments. Code and attachments aren’t inspected."}
        </DialogDescription>
      </DialogHeader>
      <DialogPanel>
        <div className="flex gap-3 rounded-lg border bg-muted/20 p-3">
          <FileTextIcon aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0 space-y-1">
            <p className="text-sm font-medium wrap-anywhere">{taskName}</p>
            {listName && <p className="text-xs text-muted-foreground">{listName}</p>}
          </div>
        </div>
        {error ? (
          <div className="space-y-3 text-sm">
            <p role="alert">Could not confirm the result. Check the task before retrying.</p>
            <details className="text-muted-foreground">
              <summary className="cursor-pointer">Technical details</summary>
              <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words text-xs">
                {error}
              </pre>
            </details>
          </div>
        ) : result ? (
          <div role="status" className="space-y-2 whitespace-pre-wrap text-sm">
            <p>{result.summary}</p>
            {result.estimationEvidence && (
              <div className="space-y-3 whitespace-normal">
                {result.estimateSaved && (
                  <dl className="grid grid-cols-3 gap-2 rounded-lg border p-3 text-xs">
                    <div>
                      <dt className="text-muted-foreground">Implementation</dt>
                      <dd className="mt-1 font-medium">
                        {result.estimationEvidence.implementationMinutes} min
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Verification</dt>
                      <dd className="mt-1 font-medium">
                        {result.estimationEvidence.verificationMinutes} min
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Likely follow-up</dt>
                      <dd className="mt-1 font-medium">
                        {result.estimationEvidence.followUpMinutes} min
                      </dd>
                    </div>
                  </dl>
                )}
                <details className="text-xs text-muted-foreground">
                  <summary className="cursor-pointer">
                    Evidence · {result.estimationEvidence.files.length}{" "}
                    {result.estimationEvidence.files.length === 1 ? "file" : "files"} ·{" "}
                    {result.estimationEvidence.confidence} confidence
                  </summary>
                  <p className="mt-2">
                    Read-only research. Tests and project scripts were not run.
                  </p>
                  <ul className="mt-2 max-h-40 space-y-1 overflow-auto">
                    {result.estimationEvidence.files.map((file) => (
                      <li key={file} className="wrap-anywhere">
                        {file}
                      </li>
                    ))}
                  </ul>
                  {[...new Set(result.estimationEvidence.limitations)].map((limitation) => (
                    <p key={limitation} className="mt-2">
                      {limitation}
                    </p>
                  ))}
                </details>
              </div>
            )}

            {result.estimateSaved && !result.tagRemoved && (
              <p className="text-warning-foreground">
                The estimate was saved, but the estimation tag could not be removed.
              </p>
            )}
            {result.findingsPosted && <p>Findings posted to ClickUp.</p>}
            {result.findings && <p>{result.findings}</p>}
          </div>
        ) : (
          <p role="status" className="text-sm text-muted-foreground">
            {action === "estimate" ? "Estimation" : "The requirements check"} continues after
            closing.
          </p>
        )}
      </DialogPanel>
      <DialogFooter variant="bare">
        {state && (
          <Button size="sm" variant="outline" onClick={onRetry}>
            {error ? "Retry" : "Run again"}
          </Button>
        )}
        <Button size="sm" onClick={onClose}>
          {state ? "Done" : "Continue working"}
        </Button>
      </DialogFooter>
    </>
  );
}
