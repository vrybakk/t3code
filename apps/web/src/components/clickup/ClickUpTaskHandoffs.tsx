import { useAtomValue } from "@effect/atom-react";
import type { ClickUpHandoff, ClickUpTaskInput, EnvironmentId } from "@t3tools/contracts";
import { Link } from "@tanstack/react-router";
import * as Option from "effect/Option";
import { AsyncResult } from "effect/unstable/reactivity";
import { useRef, useState } from "react";
import { appAtomRegistry } from "../../rpc/atomRegistry";
import { serverEnvironment } from "../../state/server";
import { useAtomCommand } from "../../state/use-atom-command";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Checkbox } from "../ui/checkbox";
import { safeClickUpAttachmentUrl } from "./taskPrompt";

const statusLabels = {
  pending: "Ready for your check",
  submitting: "Submitting",
  submitted: "Submitted for code review",
  partial: "Partially submitted",
  uncertain: "Needs confirmation",
} as const;

export function ClickUpTaskHandoffs({
  environmentId,
  input,
}: {
  environmentId: EnvironmentId;
  input: ClickUpTaskInput;
}) {
  const query = serverEnvironment.clickUpWorkflow({ environmentId, input });
  const result = useAtomValue(query);
  const data = Option.getOrNull(AsyncResult.value(result));
  return (
    <section className="space-y-3" aria-label="Developer handoff">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium">Developer handoff</h3>
        <Button
          size="sm"
          variant="ghost"
          disabled={result.waiting}
          onClick={() => appAtomRegistry.refresh(query)}
        >
          Refresh
        </Button>
      </div>
      {AsyncResult.isFailure(result) ? (
        <p role="alert" className="text-sm text-destructive">
          Could not load handoffs. Refresh before submitting.
        </p>
      ) : !data ? (
        <p role="status" className="text-sm text-muted-foreground">
          Loading handoffs…
        </p>
      ) : !data.handoffs.length ? (
        <p className="text-sm text-muted-foreground">
          The agent will prepare a handoff here when implementation and review are ready.
        </p>
      ) : (
        data.handoffs.map((handoff) => (
          <HandoffCard
            key={handoff.id}
            handoff={handoff}
            environmentId={environmentId}
            input={input}
            onRefresh={() => appAtomRegistry.refresh(query)}
          />
        ))
      )}
    </section>
  );
}

function HandoffCard({
  handoff,
  environmentId,
  input,
  onRefresh,
}: {
  handoff: ClickUpHandoff;
  environmentId: EnvironmentId;
  input: ClickUpTaskInput;
  onRefresh: () => void;
}) {
  const submit = useAtomCommand(serverEnvironment.clickUpSubmitWorkflow, { reportFailure: false });
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unconfirmedReceipt, setUnconfirmedReceipt] = useState<ClickUpHandoff | null>(null);
  const unconfirmed = unconfirmedReceipt === handoff;
  const sending = useRef(false);
  const canSubmit = handoff.status === "pending" || handoff.status === "partial";
  async function send() {
    if (!checked || !canSubmit || sending.current || unconfirmed) return;
    sending.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await submit({ environmentId, input: { ...input, handoffId: handoff.id } });
      if (result._tag === "Success") {
        setChecked(false);
        appAtomRegistry.refresh(serverEnvironment.clickUpTask({ environmentId, input }));
      } else {
        setUnconfirmedReceipt(handoff);
        setError(
          "Submission could not be confirmed. Refresh and check the PRs and task before retrying.",
        );
      }
    } catch {
      setUnconfirmedReceipt(handoff);
      setError(
        "Submission could not be confirmed. Refresh and check the PRs and task before retrying.",
      );
    } finally {
      onRefresh();
      sending.current = false;
      setBusy(false);
    }
  }
  return (
    <div className="space-y-3 rounded-lg border border-border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Badge variant="secondary">{statusLabels[handoff.status]}</Badge>
        <Link
          to="/$environmentId/$threadId"
          params={{ environmentId, threadId: handoff.threadId }}
          className="text-xs text-primary hover:underline"
        >
          Open thread
        </Link>
      </div>
      <p className="whitespace-pre-wrap text-sm">{handoff.summary}</p>
      <ul className="space-y-2 text-sm">
        {handoff.evidence.map((item) => (
          <li key={`${item.kind}:${item.details}`}>
            <span className="font-medium">
              {item.kind === "independent-review" ? "Independent review" : "Verification"}:{" "}
              {item.outcome === "passed" ? "Passed" : "Waived"}
            </span>
            <p className="whitespace-pre-wrap text-muted-foreground">{item.details}</p>
          </li>
        ))}
      </ul>
      <ul className="space-y-2 text-sm">
        {handoff.pullRequests.map((pr) => (
          <li key={pr.url}>
            {safeClickUpAttachmentUrl(pr.url) && (
              <a
                href={pr.url}
                target="_blank"
                rel="noreferrer"
                className="text-primary hover:underline"
              >
                {pr.repository} #{pr.number}
              </a>
            )}
            <span className="ml-2 text-xs text-muted-foreground">
              {pr.ready ? "Ready" : "Awaiting submission"}
              {pr.reviewerRequested ? " · Reviewer requested" : ""}
            </span>
          </li>
        ))}
      </ul>
      {(handoff.status === "partial" || handoff.status === "uncertain") && (
        <p className="text-xs text-muted-foreground">
          Code Review status: {handoff.statusUpdated ? "Updated" : "Not confirmed"}. Handoff
          comment: {handoff.commentPosted ? "Posted" : "Not confirmed"}.
        </p>
      )}
      {handoff.error && (
        <p role="alert" className="text-sm text-destructive">
          {handoff.error}
        </p>
      )}
      {handoff.status === "uncertain" && (
        <p className="text-sm text-muted-foreground">
          Check the result in GitHub and ClickUp with the agent before continuing. Automatic retry
          is paused.
        </p>
      )}
      {canSubmit && (
        <>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={checked}
              disabled={busy || unconfirmed}
              onCheckedChange={(value) => setChecked(value === true)}
            />
            I completed my manual check and approve this handoff.
          </label>
          <p className="text-xs text-muted-foreground">
            Submit marks these PRs ready, requests CTO review, and moves the task to Code Review.
            Merge and deployment stay with the CTO.
          </p>
          <Button size="sm" disabled={!checked || busy || unconfirmed} onClick={() => void send()}>
            {busy
              ? "Submitting…"
              : handoff.status === "partial"
                ? "Continue submission"
                : "Submit for code review"}
          </Button>
        </>
      )}
      {error && unconfirmed && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {unconfirmed && (
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setChecked(false);
            onRefresh();
          }}
        >
          Refresh submission status
        </Button>
      )}
    </div>
  );
}
