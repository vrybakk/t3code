import { ClickUpError, type PullRequestRef } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import type { PullRequestService } from "../pullRequest/PullRequestService.ts";

export const refreshHandoffPullRequest = Effect.fn("ClickUpWorkflow.refreshPr")(function* (
  prs: PullRequestService["Service"],
  ref: PullRequestRef,
) {
  yield* prs
    .invalidate({ reference: ref })
    .pipe(
      Effect.mapError(() => new ClickUpError({ message: "Could not refresh the pull request." })),
    );
  const detail = yield* prs
    .detail(ref)
    .pipe(Effect.mapError((error) => new ClickUpError({ message: error.message })));
  if (detail.provider !== "github" || !detail.headSha || !detail.author || detail.state !== "open")
    return yield* new ClickUpError({
      message:
        "Handoffs require open GitHub pull requests with a known author and verifiable head commit.",
    });
  return { ...detail, headSha: detail.headSha };
});
