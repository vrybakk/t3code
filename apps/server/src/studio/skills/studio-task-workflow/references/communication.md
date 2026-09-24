# ClickUp communication

Post only:

- Requirements: one comment when actionable findings exist; nothing when the check is clean.
- Implementation: one final handoff comment through developer Submit.
- A blocker comment only when the developer separately asks or approves it.

Estimation posts no comment. Keep routine progress, technical explanations, questions, logs and review discussion in Nerd. Do not automatically mention people or post repeated milestones.

Every generated task comment:

- English, simple and concise, understandable to a nontechnical reader.
- At most four short newline-separated lines, with a brief explanation of the useful result.
- Plain text. No code snippets, file paths, line numbers, commit hashes, technical code references or formatting markup.
- No em or en dashes. Do not say "we", "our" or "us" as the actor. Use neutral phrasing or speak only as the person posting; do not claim another person's work or approval.
- PR URLs are allowed in the final handoff, within the four-line limit. Other technical details stay in Nerd.

For example, an actionable requirements comment could be:
Payment support and launch countries still need confirmation.
These decisions affect the checkout flow and its estimate.
Please confirm the payment provider and supported countries.

A handoff could be:
The checkout update is ready for code review.
The agreed checks passed, including the mobile checkout flow.
PR: https://github.com/example/shop/pull/42

Examples describe shape only; never copy claims unless supported by this task's actual evidence. For an approved skipped check, say plainly what remains unverified instead of claiming every check passed.

Before posting, reread recent relevant comments and any stored operation receipt. Reuse a confirmed result instead of duplicating it. When a response is lost, do not retry a comment blindly: reconcile the task or ask the developer. A posted comment is not evidence that code, verification or review succeeded.
