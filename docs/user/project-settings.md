# Settings and project overrides

On web and desktop, the Settings breadcrumb ends with the environment and project a change applies to. They start
at **All environments** and **All projects** and stay selected as you move between categories or
search for a setting.

Preferences saved on this device, such as appearance, confirmations and browser profiles, always
show and ignore the selection. Everything else is stored on a server. Choose one environment to
edit its settings, or leave **All environments** to edit every connected environment at once.
Offline environments keep their current values; this is a bulk edit, not a synced global default.

Choose a project to override settings for it on the selected environments. A layers icon beside
each server row's title shows where the value comes from: the built-in default, the environment,
or a project override. Click it to see that chain on every selected environment. An override can
be reset to inherit again. Settings that cannot be overridden by a project are shown read-only
while a project is selected.

When the selected environments disagree, the control shows **Mixed** in place of a value and the
layers icon turns amber. Picking a value applies it to every selected environment.

Changing an environment value never touches a project's own override. When projects override the
setting you are editing, the layers icon counts them and the chain lists each one with its value:
click a project to jump to it, or **Reset all** to make those projects follow the environment
again.

Providers and diagnostics are per machine: they show one environment at a time, the primary
one until you pick another. Every other setting fans out to the selection.

On mobile, open **Settings** and use the filter in its header to choose connected environments
and a project. The filter stays available in server-setting pages. With **All projects** selected,
the **Server settings** categories and auto-settle controls in **Thread behavior** edit the
selected environments' defaults. Choosing a project edits its overrides on the selected
environments. Use **Use defaults** in a page to remove that page's project overrides.
Open **Settings → Projects & threads → Overview** to rename the project across its selected
connected checkouts and see where those checkouts live.
Settings that are environment-wide stay read-only while a project is selected. When selected
targets disagree, a control shows **Mixed** until you choose one value. Appearance, keyboard,
and other phone-only settings ignore the filter.

## Defaults and inheritance

General contains the model and workspace for new threads. Integrations controls agent browser
access. Source Control contains automatic pull, the default pull request merge method and text
generation. The same rows edit environment defaults or project overrides depending on the
project crumb.

The Project category, shown while a project is selected, holds the project's name, icon, actions,
checkouts and removal. Actions belong to a project: editing them creates the project's own list
on each selected environment, and reset returns to the environment's shared list. A project's
`t3.json` actions can be imported there.

For workspace mode, a project's `t3.json` preference applies when the project has no override.
Browser access changes apply when an agent session next starts.

## Storage usage

In **Settings → Storage**, select one connected machine and scan its storage to find large
agent histories. The report covers that machine's T3 data and configured Codex and Claude Code
homes, not your entire disk. Refresh to take a new measurement; folder navigation, search and
pagination use the last scan. Histories from other providers are not included yet.

Under **Usage**, open **Overview** for totals, **Breakdown** for categories and folder/file
drill-down, or **Histories** to find the largest conversations. Codex subagents are grouped with
their parent conversation when native history metadata proves the relationship. Open a group to
inspect its individual histories;
combined sizes count shared files only once. Missing metadata does not mean a history is unused.

File size and allocated disk space can differ. Allocated space is filesystem-reported and is
not a promise of space recoverable by deletion, especially on filesystems with shared blocks.
Scan warnings identify incomplete measurements. A history without a matching T3 conversation
may belong to another app or environment; it is not necessarily unused. Deleting a T3
conversation does not delete its provider's native history.

To clean native histories, select conversations or individual histories under **Usage →
Histories** and review the selection. Suggestions help prioritize review; histories are never
automatically deleted merely because they are unlinked. Stop other agent activity on that machine
before confirming. T3 checks its tracked chat sessions; activity in other apps, other T3 servers,
and background provider helpers cannot be fully verified.
Changed files and T3-open sessions are blocked and must be reviewed again.

Cleanup runs on the selected machine. It removes native provider history, not project files or
the T3 conversation. Native resume may stop working, and provider indexes may still list a removed
session. Existing T3 messages are not a backup of the provider's full history.

**Move to Trash** is the default on macOS hosts. Restore through that machine's Trash if needed;
space is not reclaimed until Trash is emptied. Other hosts currently require an explicit permanent
delete choice. Permanent deletion cannot be undone in T3, and neither mode promises the full
reported size as reclaimed space. Trash failures never fall back to permanent deletion.

## Storage cleanup

Open **Settings → Storage → Settings** to configure worktree and artifact cleanup
on one machine or all connected environments. Policies are off by default and run on the server
at startup, when changed, and hourly. Offline machines keep their existing policies.

Select a project to set **Automatic worktree cleanup** to **Inherit**, **Off**, or **Custom**.
Inherit follows each machine's rules; Off keeps that project's worktrees until you remove them
manually. Custom applies separate worktree rules to the selected project or checkout. Browser
captures and log retention remain machine-wide.

Worktrees can be removed after a chosen number of inactive days, after merging, or when they
have no commits beyond the default branch. Only T3-managed worktrees are eligible. Active
sessions, shared worktrees, uncommitted changes, and ignored files other than `node_modules`
prevent removal. Branches and thread history stay; starting another turn recreates the checkout.
Merge cleanup requires the commits to be included in the remote default branch, so squash merges
may need the inactivity rule instead.

Enable **Delete worktrees with deleted threads** to remove safe worktrees after their last
thread is deleted, including archived threads and worktrees left by earlier deletions. The
server waits for sessions and terminals to stop and retries skipped worktrees after restart.
Existing prompts for deleting a worktree manually remain available when this policy is off.

Browser captures and rotated logs have separate retention periods. Expired capture links stop
working. Current logs, message attachments, and browser profiles are kept.

## Project icons

Select the project and open Project to choose an icon, emoji, monogram, or image. The choice applies to
every checkout in the project group and appears on connected clients. Choose **Automatic** to let
T3 Code detect an icon again.

Choose **Monogram** in the icon picker to set one or two letters or numbers and a color.

When no image is found, web and desktop show a two-character monogram with a color
from the icon palette, derived from the saved project name. For example, `Nebula` becomes `NA`,
`Silver Orchard` becomes `SO`, and `M7 Forge` becomes `M7`.

## Keep the default branch current

In Source Control, enable **Automatically pull** to keep the default-branch checkout up to date
with its configured upstream. Choose an environment to set the default or a project to override it.
On mobile, use **Settings → Source control** to change selected environment defaults or project overrides.

T3 Code only pulls when it can fast-forward and the checkout has no changed files, untracked files,
or local commits. It skips checkouts on another branch or without an upstream. If a checkout has
local work, resolve it yourself before automatic pulls can resume.
