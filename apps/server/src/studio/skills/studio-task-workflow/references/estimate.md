# Estimate

Read the current task first. If a time estimate already exists, preserve it and stop; an old estimation-needed tag is not authorization to overwrite it. Explain any inconsistent tag in Nerd. Never add a tag to bypass this restriction.

Inspect relevant code, requirements, dependencies and verification setup. Ask about material unknowns before saving. For smaller assumptions, state them explicitly in Nerd. Estimate expected elapsed work to a review-ready result using AI, including research required to implement, implementation, verification, integration across repositories and likely fixes. Exclude waiting for CTO review/deployment and external waiting. Consider useful parallelism without adding overlapping work twice.

Give one researched estimate in minutes plus a brief breakdown and uncertainty in Nerd. Do not substitute unaided developer hours, token cost or an arbitrary minimum. Do not claim precision unsupported by the evidence.

Use `complete_clickup_estimation` to save a missing estimate. Its saved-value confirmation must succeed before the estimation-needed tag is removed. If no such tag exists, save the estimate without adding one. If another person added an estimate in the meantime, preserve it and report the conflict.

A partial result means the estimate may be saved while the tag remains. Reread and report that state; do not blindly save again or replace the confirmed estimate. Never call the write tool in a provider's read-only/plan mode; ask to switch to a mode that permits the requested write.

Do not post any ClickUp comment, change status, implement, create a PR, or continue into another action. Explain the result and any remaining blocker in Nerd, then stop.
