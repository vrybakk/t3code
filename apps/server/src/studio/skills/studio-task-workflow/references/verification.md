# Verification and review evidence

Derive checks from the actual acceptance criteria and changed behavior. Use existing repository testing skills and commands, scoped to the work. Avoid tests that merely mirror implementation or assert static markup.

For web UI changes, verify the affected user journey in an actual browser and include relevant responsive/error states. For mobile changes, use an available device or simulator and verify the affected journey. For service/data changes, exercise meaningful API/data behavior. Include a regression check around the changed behavior. A typecheck does not prove a browser flow; mocked tests do not prove an external integration.

Record what ran, the result, the code revision/environment, and useful artifacts. Every UI feature or UI fix PR must include screenshots or video recordings in its description from the actual verified build. Include clear before/after screenshots where applicable; use a short recording when motion, timing, transitions or interaction are needed to demonstrate the result. Capture evidence during authorized browser/device verification, upload it to the PR host or an approved durable location, and embed or link it in the PR body so the reviewer can open it. Local filesystem paths are not shareable evidence. Keep PR-only media out of the repository unless repository rules explicitly require otherwise.

If capture or upload is blocked, ask for help and follow the explicit-exception process below. Keep the PR draft and do not claim the UI handoff is review-ready while required evidence is missing. Never label unexecuted checks passed. Avoid using live customer data or mutating live external systems solely to produce test evidence unless that specific operation is authorized.

Use Nerd's available Browser/Device tools when applicable, following their capabilities and repository permissions. Isolate task test state, ports and worktrees; never kill unrelated processes or run a test server against the user's live Nerd database.

When a required check cannot run, explain the concrete blocker and first ask for help. If help cannot resolve it, ask whether to proceed without that named check. Record the developer's exact exception and residual limitation in the handoff. Generic urgency or broad permission to implement is not a waiver. Do not ask again for an already-granted applicable exception.

Independent review must inspect the final changes against agreed requirements and project rules, not only formatting. Capture the reviewer identity/role and findings. Fix substantiated findings, rerun relevant checks, and have the affected changes re-reviewed when needed. If independent review is unavailable, ask the developer what agent or review alternative to use; never silently relabel self-review.
