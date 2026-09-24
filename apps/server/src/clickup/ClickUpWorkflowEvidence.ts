import {
  ClickUpError,
  ClickUpWorkflowText,
  type ClickUpHandoff,
  type ClickUpPrepareHandoffInput,
  type ThreadId,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

export const decodeWorkflowText = Schema.decodeUnknownEffect(ClickUpWorkflowText);

export const handoffSummary = Effect.fn("ClickUpWorkflow.handoffSummary")(function* (
  input: ClickUpPrepareHandoffInput,
) {
  for (const kind of ["independent-review", "verification"] as const)
    if (!input.evidence.some((item) => item.kind === kind))
      return yield* new ClickUpError({
        message: `Record ${kind} evidence or the developer's explicit waiver.`,
      });
  const waived = input.evidence.some((item) => item.outcome === "waived");
  if (waived && !input.waiverSummary)
    return yield* new ClickUpError({
      message: "Include a brief developer-approved waiver disclosure for the final comment.",
    });
  if (new Set(input.reviewedHeads.map((item) => item.url)).size !== input.reviewedHeads.length)
    return yield* new ClickUpError({ message: "Provide each reviewed pull request once." });
  return yield* decodeWorkflowText(
    [input.summary, ...(waived ? [input.waiverSummary] : [])].join("\n").replace(/\r\n?/g, "\n"),
  ).pipe(
    Effect.mapError(
      () =>
        new ClickUpError({
          message:
            "The final summary and waiver disclosure must fit within four plain English lines.",
        }),
    ),
  );
});

export function matchingHandoff(
  handoffs: ReadonlyArray<ClickUpHandoff>,
  expected: {
    threadId: ThreadId;
    summary: string;
    evidence: ClickUpHandoff["evidence"];
    pullRequests: ClickUpHandoff["pullRequests"];
  },
): ClickUpHandoff | undefined {
  return handoffs.find(
    (item) =>
      item.threadId === expected.threadId &&
      item.summary === expected.summary &&
      item.evidence.length === expected.evidence.length &&
      item.evidence.every((entry, index) => {
        const evidence = expected.evidence[index]!;
        return (
          entry.kind === evidence.kind &&
          entry.outcome === evidence.outcome &&
          entry.details === evidence.details
        );
      }) &&
      item.pullRequests.length === expected.pullRequests.length &&
      item.pullRequests.every(
        (pr, index) =>
          pr.url === expected.pullRequests[index]!.url &&
          pr.headSha === expected.pullRequests[index]!.headSha,
      ),
  );
}
