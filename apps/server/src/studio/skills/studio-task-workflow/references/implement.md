# Implement

## Establish scope

Read current task context and the mapped repositories. Respect `no agent`: stop implementation and explain the restriction without removing the tag. Clarify material requirements. Identify acceptance criteria, required repositories, existing relevant skills and verification commands.

If estimation is needed and no estimate exists, load `get_studio_task_workflow` with mode `estimate` to obtain its estimation procedure. Follow that procedure before implementation, then return to the already authorized Implement action instead of stopping at the estimate-only boundary. Preserve any existing estimate. Clarifying a task does not authorize silently expanding it.

When implementation actually begins, use `start_linked_clickup_implementation` to set In Progress. Requirements research alone is not a status transition. If the transition fails or the current status suggests concurrent work or a later stage, report it and ask how to proceed.

## Build, verify and independently review

Coordinate work according to [coordination](coordination.md). Implement only the agreed scope. Use the repository's existing patterns and specialist skills, rather than replacing them with a second generic process.

Follow [verification](verification.md). Keep concrete evidence for each acceptance criterion and repository. Obtain independent review, fix substantiated findings, and recheck affected behavior. If tests or review are unavailable, ask the developer for help or an explicit alternative; deadlines do not waive a gate.

## Prepare the developer handoff

Refresh task context and pause if scope changed materially. Complete the branch, upstream-update and PR-base checks in [coordination](coordination.md). Commit and push the task's changes and create draft PRs using authorized existing source-control tools. Do not merge or deploy. Do not request CTO review yet. Register every PR using `link_pull_request`; use `list_thread_pull_requests` to verify the set.

Write each PR description so a reviewer can understand its main goal in about 20 seconds. Lead with one or two short, plain-language sentences explaining the problem and resulting behavior. Add a brief statement of what was verified and only the decisions or limitations needed for review. Remove filler, repeated summaries, implementation diaries, and file-by-file narration. Follow required repository templates and attribution rules while keeping their content concise. Every UI feature or fix needs the screenshots/video required by [verification](verification.md) embedded or linked in its PR description. Before handoff, read the final PR body and check that its base, diff, current revision, description and accessible evidence all match the delivered work.

Use `prepare_linked_clickup_handoff` only after the implementation, required verification and independent review are complete, or explicit developer-approved alternatives are recorded. Supply evidence, remaining limitations, and a final comment draft following [communication](communication.md). Include every repository required for the task. Pass `reviewedHeads` with each registered PR's `url` and the exact `headSha` that was independently reviewed and verified; use the authorized GitHub tooling to obtain that revision, never substitute a newer unreviewed head. If any evidence is explicitly waived by the developer, supply a plain-language `waiverSummary` disclosing the skipped check. The tool appends that disclosure to the final comment, so the combined comment must still fit four lines. The tool records the handoff; it does not mean the developer approved it.

Tell the developer what changed, what was verified, any explicit exceptions, and what they should manually check. Keep the task In Progress and PRs draft. Stop for the developer's manual check and Submit.

## Submit belongs to the developer

Never call a UI, CLI or other API to impersonate the developer's Submit. After the developer submits in Nerd, Nerd checks the recorded PR revisions, marks PRs ready, requests review from `vrybakk` except when that account authored the PR, changes the task to Code Review and posts the final handoff comment. Do not reproduce those writes through alternate tools.

If code or required evidence changes after preparation, refresh the handoff and repeat affected checks before Submit. A partial Submit is not a completed handoff; show the actual completed and failed steps. QA Testing, Staging, In Production, merge and deployment remain outside this action.
