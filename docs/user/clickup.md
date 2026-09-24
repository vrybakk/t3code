# ClickUp tasks

Connect your own ClickUp account in **Settings → Integrations → ClickUp**. Select the environment
that owns your projects first. Your CTO must configure the integration on that environment before
sign-in is available. After authorizing ClickUp, return to Nerd. Your connection updates automatically.

Open **Tasks** from the sidebar or command palette, select a workspace, and browse open tasks
assigned to you, including subtasks. Task details include the description, attachment links, and
the most recent comments. Use **Open in ClickUp** for the full discussion, including replies.
Refresh when you need the latest task changes.

Choose a project and select **Open in coding thread** to prepare a draft containing the task
context and studio workflow guidance. Review the model and permissions, then send it to begin.
The existing worktree setup creates an isolated checkout. The task link is saved when the thread
is created; return to the task to find its coding threads. You can open additional threads for
other repositories involved in the same task.

This initial integration reads ClickUp data. Status updates, task edits, inbox notifications,
automatic sprint selection, and automated PR handoff are not available yet. The task association
does not change Work reports or export time to ClickUp.

Disconnecting removes Nerd's saved ClickUp credential for that environment. It does not revoke
the app's authorization in ClickUp or remove existing task context from coding threads.
