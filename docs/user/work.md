# Work

Use **Work** in the sidebar to keep a personal, local record of time and agent activity for an
environment. In **Settings → Work**, select the environment, set your profile and timezone, then
enable local tracking. Work automatically creates
a tracking project for each T3 project and includes Git repositories found beneath its workspace,
including repositories nested in a shared folder.

Agent turns and tasks are captured automatically. Use **Add entry** on Overview to record manual
work outside those events. In Reports, the **All activity** list includes agent and manual records,
loads one page at a time, and lets you edit manual entries. Filter it by project and date range;
activity date filters do not change the monthly chart or CSV export.
Automatic agent metrics remain evidence and cannot be edited.

Tracking projects are internal reporting records and do not need to be created or attached by hand.
Use **Tracking settings** only when you need to correct which discovered repositories are included.
Linked Git worktrees belong to the same repository. Excluding a repository changes repository
attribution, not project time or token capture; disable local tracking to stop capturing activity.
Work shows running agent sessions with live elapsed time. Their metrics enter the ledger when the
turn ends; these timers do not measure developer time.

Reports show all projects for the selected month, with daily time and project totals. Switch between
manual time, agent elapsed time, and task time without combining them. Agent is the default view.
Task time is provider-reported agent task/subagent duration; it can overlap agent elapsed time,
and providers do not always report it. Filter to one project when
needed, or export the entire month as one CSV.

For a fixed per-project handoff, create a monthly snapshot under **Project snapshots and delivery**.
Snapshots move from **Open** to **Submitted**, then **Invoiced**; invoiced snapshots cannot change.

The ledger stays in the environment's local storage. Use the backup controls in **Settings → Work** to export a
backup before moving or restoring local data. Agent elapsed time is available when captured, but
active and waiting time can remain unavailable because providers do not expose those states.

## Sync time to ClickUp

After submitting a task handoff, use **Sync ClickUp time** to review its recorded time. The same
option in **Work** lets you catch up on older records, including archived threads. Attach a task
to the thread first; manual entries without a thread can be edited in Work to assign one.

Single-task records default to their linked task. For a thread with several tasks, choose one task
for each record before syncing, or leave it skipped. Sync applies to the selected records on the
current page. Refresh after an agent turn finishes to include its final runtime.

Exports create completed, non-billable entries under your connected ClickUp account without
changing its running timer. Full agent runtime, including any waiting, is labeled as agent time;
manual work is labeled separately. Subagent/task totals are excluded because they can overlap
agent runtime. A manual entry's recorded date and time is used as its start.

Already synced records are not exported again. If delivery is unconfirmed, **Check delivery** looks
for the existing entry without resending it. If a manual record changes after export, reconcile
its existing entry in ClickUp; syncing will not add a second entry or overwrite your changes.
