# ClickUp tasks

Connect your own ClickUp account in **Settings → Integrations → ClickUp**. Select the environment
that owns your projects first. Your CTO must configure the integration on that environment before
sign-in is available. After authorizing ClickUp, return to Nerd. Your connection updates automatically.

Open **Tasks** from the sidebar or command palette and select the Nerd studio workspace.
The sprint sidebar shows three previous sprints, the active sprint, and the next sprint when
available. The active sprint opens automatically. Tasks come from **Dev Hub → Sprints**,
including tasks planned from other project spaces and completed work.
Sprints initially show tasks assigned to you. Use **Show all** to see the team's tasks;
your selection is preserved while opening a task and returning to the sprint.
Active tasks are grouped by due day in your local timezone, earliest first, with a count for each
day and priority ordering within it. Undated tasks follow the dated groups, then Code Review. QA Testing,
Staging, and In Production are collapsed below it; expand the section to see those groups
in that order, each sorted by priority. Tasks without a priority appear last in their group.

Change a task's status from the sprint table or task details. Add or remove tags in task details.
The choices come from that task's original project list and space, including when it is
planned in a shared company sprint.

Select a task to open its full detail screen: description, task properties, custom fields,
attachments, checklists, subtasks, and recent comments. Empty custom fields can be expanded.
Use **Tasks** to return to the selected sprint, or **Open in ClickUp** for the full change
history. Use **Older** and **Newer** to browse comments. Refresh to retrieve changes.
Write a comment in the activity panel and select **Post comment**. Select **Reply** under a
comment to read its conversation and send a reply without leaving the task. Drafts remain
if sending fails; refresh before retrying an unconfirmed send to avoid duplicates.

Open image and video attachments from the task or its comments in the media viewer.
Assigned comments show their owner and can be resolved or reopened. Checklist items show
their assignee and can be checked off or reopened here too. These actions update ClickUp;
Nerd refreshes the item after saving. Other files open through their original attachment link.

Use **Link repositories** in a task’s **Linked work** section to connect its Project-field value,
source List, Folder, or Space to one or more local repositories. A shared API repository can
belong to several mappings. Mappings are saved on the selected environment. The first match
wins: Project field, List, Folder, then Space; removing a mapping restores the broader fallback.
The repository picker suggests the linked repositories; **Show all repositories** allows a manual
choice. Project badges use the ClickUp Project-field color when available.

Use **Check requirements**, **Estimate task**, or **Implement** from the sprint table or task page.
Choose a repository and select **Prepare thread**, then review the request, model and permissions
and send it to begin. Requirements checks request a review of gaps without editing files or
ClickUp; native plan mode applies when enabled in your settings and supported by the selected provider.
Review the thread's mode and permissions before sending. Estimates research the time to a review-ready result without implementing; when the task
has **estimation needed**, the agent can save the estimate and remove the tag. Otherwise it proposes
the estimate in the thread. Implement follows the studio implementation and verification workflow.
The existing worktree setup creates an isolated checkout. The task link is saved when the thread
is created; return to the task to find its coding threads and their linked pull requests. You can open additional threads for
other repositories involved in the same task.

When a linked task has the **estimation needed** tag, the agent researches the scope and
proposes an AI-assisted estimate for reaching a review-ready result: implementation,
verification, and likely fixes, excluding waiting for CTO review or deployment. During
authorized estimation or implementation it saves the estimate in ClickUp, verifies it, then removes the tag. In plan
mode it only proposes the estimate. Unclear requirements need clarification first. A failed
tag removal leaves the saved estimate intact and is reported separately. Refresh task details
to see agent updates; existing provider sessions may need restarting to pick up the new tools.

Description edits, inbox notifications,
and automated PR handoff are not available yet. The task association
does not change Work reports or export time to ClickUp.

Disconnecting removes Nerd's saved ClickUp credential for that environment. It does not revoke
the app's authorization in ClickUp or remove existing task context from coding threads.
