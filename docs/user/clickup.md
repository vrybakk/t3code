# ClickUp tasks

Connect your own ClickUp account in **Settings → Integrations → ClickUp**. Select the environment
that owns your projects first. Your CTO must configure the integration on that environment before
sign-in is available. After authorizing ClickUp, return to Nerd. Your connection updates automatically.

Open **Tasks** from the sidebar or command palette and select the Nerd studio workspace.
The sprint sidebar shows three previous sprints, the active sprint, and the next sprint when
available. The active sprint opens automatically. Tasks come from **Dev Hub → Sprints**,
including tasks planned from other project spaces and completed work.

Select a task to open its full detail screen: description, task properties, custom fields,
attachments, checklists, subtasks, and recent comments. Empty custom fields can be expanded.
Use **Tasks** to return to the selected sprint, or **Open in ClickUp** for the full change
history and comment replies. Use **Older** and **Newer** to browse comments. Refresh to retrieve changes.

Open image and video attachments from the task or its comments in the media viewer.
Assigned comments show their owner and can be resolved or reopened. Checklist items show
their assignee and can be checked off or reopened here too. These actions update ClickUp;
Nerd refreshes the item after saving. Other files open through their original attachment link.

Choose a project and select **Open in coding thread** to prepare a draft containing the task
context and studio workflow guidance. Review the model and permissions, then send it to begin.
The existing worktree setup creates an isolated checkout. The task link is saved when the thread
is created; return to the task to find its coding threads and their linked pull requests. You can open additional threads for
other repositories involved in the same task.

Task status updates, description edits, inbox notifications,
and automated PR handoff are not available yet. The task association
does not change Work reports or export time to ClickUp.

Disconnecting removes Nerd's saved ClickUp credential for that environment. It does not revoke
the app's authorization in ClickUp or remove existing task context from coding threads.
