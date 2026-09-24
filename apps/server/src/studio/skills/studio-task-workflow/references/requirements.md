# Check requirements

Inspect current task materials and relevant code. Determine the requested outcome, acceptance criteria, affected repositories, dependencies and unanswered decisions. Seek answers in existing documentation and related tasks before asking the developer.

Do not implement, edit source files, create or publish PRs, change task status, or estimate as a side effect. Existing estimates remain unchanged.

A finding is an actionable gap, contradiction, missing decision, or concrete dependency that prevents a reliable implementation or materially affects its scope. Restating the task, saying it looks good, or describing routine research is not a finding.

Report findings, acceptance criteria and questions in Nerd. If there are actionable findings, call `post_linked_clickup_findings` with a single concise plain-language comment following [communication](communication.md). Post only the useful findings, not a research transcript. If there are no findings, post nothing to ClickUp; report the clean result in Nerd and stop.

Keep a maximum of four short lines in the task comment. If findings exceed that space, summarize the highest-impact gaps and discuss the full set with the developer in Nerd. Never invent certainty or imply PM approval. Do not rewrite the task description. Posting findings does not authorize continuing into implementation.
