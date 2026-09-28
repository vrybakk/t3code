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
The repository picker preselects a linked repository and remembers your choice for tasks in the
same ClickUp project or location on this client. Without a mapping, it suggests an exact name
match or the first available project. Review the selection before preparing the thread;
**Show all repositories** allows a manual choice. Project badges use the ClickUp Project-field
color when available.

Linked repositories appear with their local paths even before you create a thread. The mapping
editor suggests an exact repository-name match when there is only one match. Save the selection
once to reuse it for every task in that scope; this does not run an AI agent.

You can also save a known GitHub repository URL. If its checkout is missing, select **Set up
repository** to check access using the selected environment's GitHub account. Confirm an empty
destination folder before downloading. Nerd remembers the location and waits for the download
to finish before preparing task work. Reopen existing mappings and save their links once to
retain their repository URLs too. Mappings belong to the selected environment; other developers'
computers are not configured automatically.
If a linked workspace contains existing repository folders, Nerd checks their remotes before
offering a download. Tasks started from such a parent folder use a local thread with those
repository paths in the prepared request.

Use **Check requirements** or **Estimate task** from the sprint table or task page to run
background analysis with your environment's default text-generation model. Results appear in
the action dialog; you can close it while analysis runs. Enable notifications in **Settings → General**
to receive task alerts while Nerd is open. Clicking an alert opens the task. Task analysis uses the same
sound and in-app notification preferences as threads.
Reopening shows the same run or its last result for this app session. Use **Run again** for a fresh analysis.
Requirements checks use the task description and supplied comments. Estimation also searches and
reads the mapped repositories, including relevant implementation, instructions and tests. It does
not change code or run project scripts. Set up the task’s linked repositories first.

**Check requirements** identifies gaps and questions without implementing or changing status.
It posts one short, plain-language findings comment only when something needs attention.
Research-backed estimates currently support Codex, Claude, OpenCode and Antigravity. Cursor and Grok report that research is unavailable. Codex estimation uses your existing sign-in with isolated CLI configuration; custom launch flags and user tools are not loaded.

A clean check does not post a comment. **Estimate task** estimates AI-assisted time to a
review-ready result, including implementation, verification, and likely fixes, excluding waiting
for CTO review or deployment. It saves a missing estimate without posting a comment, then
removes **estimation needed** if present. Existing estimates are preserved and hide the action.
Estimates show implementation, verification and specific likely follow-up separately, with the
files inspected and any limitations. Missing evidence or low confidence produces **More
investigation needed** without saving a number. Estimates have no fixed minimum or generic
buffer, and are not automatically scaled from human hours or incomplete runtime records.
Text attachments from supported ClickUp attachment hosts are read; Codex can also inspect PNG,
JPEG and WebP images. Other providers and unsupported formats (including PDF/video), inaccessible
attachments and truncated content are disclosed. Essential missing evidence needs clarification.
If tag removal fails, the saved estimate remains.

Use **Start task**, choose a repository and select **Prepare thread** to create a linked draft
with the studio workflow skill and task reference. Review the model and permissions, then send
it to begin. The agent loads the current task through its link. Configure research and review
models for all tasks in **Settings → Integrations → ClickUp**. An unset role uses the thread's
model. Implementation always uses the model selected in the thread. If a provider cannot use a
requested model, the agent asks how to continue.

**Start task** coordinates the linked repositories, moves the task to In Progress when coding
starts, verifies the result, and requests an independent review. It fixes findings before preparing
draft pull requests and a handoff in **Linked work**. The agent asks for help if required testing
is blocked; continuing without that check requires your explicit approval. Tasks tagged
**no agent** cannot start implementation, but can still be checked or estimated.

The task link is saved when the thread is created. Select **Review handoff** beside the thread's
primary task to open its handoff panel, or find it in the task's **Linked work** section.
Complete your manual check and submit the handoff there; typing "Submit" in chat does not submit it.

Nerd checks the reviewed PR revisions and current task status. Open PRs are marked ready and
sent for review to **vrybakk** unless he authored the PR; an In Progress task moves to Code Review.
When every handoff PR is merged, an In Progress or Code Review task moves to its QA status
instead, without requesting PR review again. After an earlier submission, select **Check merge
and send to QA** to reconcile it. The list must have one identifiable QA status, such as **QA**
or **QA Testing**. The handoff summary is posted once, including when continuing after merge.
Merge and deployment remain with the CTO. Partial submissions show completed and failed steps;
refresh before continuing after an unconfirmed response.

Studio instructions are updated with app releases and loaded again when work resumes.
Refresh task details to see agent updates; existing provider sessions may need restarting to
pick up new tools. Description edits and inbox notifications are not available yet. The task
association does not change Work reports or export time to ClickUp.

Threads with linked tasks are automatically archived after all their tasks reach ClickUp's
final Closed status. The server checks every minute while connected and waits for running work
or pending questions to finish. Any unfinished or unavailable task keeps its thread open. Archived conversations
keep their history; reopening one keeps it open until a linked task is reopened and completed again.
Attaching an already completed task does not archive a new conversation.

Disconnecting removes Nerd's saved ClickUp credential for that environment. It does not revoke
the app's authorization in ClickUp or remove existing task context from coding threads.
