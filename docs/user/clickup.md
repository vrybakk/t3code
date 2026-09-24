# ClickUp tasks

Connect your own ClickUp account in **Settings → Integrations → ClickUp**. Select the environment
that owns your projects first. For first-time setup, use **Configure OAuth app** and enter the
client ID, secret, and registered redirect URL supplied by your CTO. This is needed once per
machine and survives app updates. The secret stays hidden after saving; leave its field blank
when editing other settings to keep it. Then connect your own account. After authorizing ClickUp,
return to Nerd. Your connection updates automatically.

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
and send it to begin. Configure research, implementation, and review model defaults in
**Settings → Integrations → ClickUp**, or override them for one launch. An unset role uses the
thread's model. If a provider cannot use a requested model, the agent asks how to continue.

**Check requirements** researches gaps and questions without implementing or changing status.
It posts one short, plain-language findings comment only when something needs attention.
A clean check does not post a comment. **Estimate task** researches AI-assisted time to a
review-ready result, including implementation, verification, and likely fixes, excluding waiting
for CTO review or deployment. It saves the missing estimate without posting a comment, then
removes **estimation needed** if present. Existing estimates are preserved and hide the action.
Unclear requirements need clarification first. If tag removal fails, the saved estimate remains.

**Implement** coordinates the linked repositories, moves the task to In Progress when coding
starts, verifies the result, and requests an independent review. It fixes findings before preparing
draft pull requests and a handoff in **Linked work**. The agent asks for help if required testing
is blocked; continuing without that check requires your explicit approval. Tasks tagged
**no agent** cannot start implementation, but can still be checked or estimated.

The task link is saved when the thread is created. Return to the task to find its coding threads,
linked pull requests, and handoffs. Complete your manual check, then select **Submit** on the
handoff to mark its pull requests ready, request review from **vrybakk** unless he authored the
pull request, move the task to Code Review, and post a short result with the pull request links.
Merge and deployment remain with the CTO. A partial submission shows which steps succeeded;
refresh before continuing after an unconfirmed response.

Studio instructions are updated with app releases and loaded again when work resumes.
Refresh task details to see agent updates; existing provider sessions may need restarting to
pick up new tools. Description edits and inbox notifications are not available yet. The task
association does not change Work reports or export time to ClickUp.

Disconnecting removes Nerd's saved ClickUp credential for that environment. It does not revoke
the app's authorization in ClickUp or remove existing task context from coding threads.
