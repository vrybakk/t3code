# Configure the ClickUp integration

Create an OAuth app from ClickUp's workspace administration settings using its
[authentication guide](https://developer.clickup.com/docs/authentication). In Nerd, open
**Settings → Integrations → ClickUp → Configure OAuth app** on the developer's environment.
Enter the client ID, client secret, and the exact redirect URL registered in ClickUp.
For the Mac app, use `http://localhost:6326/api/integrations/clickup/callback`.

Saved configuration lives in the environment's permission-protected secret store, outside the
application bundle, and survives application updates. Only clients with `access:write` can read
configuration metadata or change it. The secret is never returned to the UI; leave it blank to
retain it when editing the same client ID. Changes take effect immediately and cancel any pending
sign-in. Disconnecting the account retains the app configuration. Removing saved configuration
does not disconnect the account and restores any environment-variable configuration.

For deployments provisioned through process environment variables, these remain supported when
no configuration is saved in Nerd:

| Variable                       | Value                                                         |
| ------------------------------ | ------------------------------------------------------------- |
| `T3CODE_CLICKUP_CLIENT_ID`     | Registered OAuth client ID                                    |
| `T3CODE_CLICKUP_CLIENT_SECRET` | OAuth client secret, kept on the server                       |
| `T3CODE_CLICKUP_REDIRECT_URI`  | Registered URL ending in `/api/integrations/clickup/callback` |

Never include the secret in a frontend build, commit it, or share it through chat. Provision it
once on each developer's machine through the studio's existing secret-sharing process.
Environment-variable changes require a server restart. Configure each server separately;
changing the desktop app does not configure a remote server.

During Mac sign-in, Nerd temporarily listens on the registered callback port on loopback only.
Close any development server using that port before connecting. Nerd never changes the registered
port silently. The listener closes after the callback, cancellation, or the ten-minute timeout.

For development, register the callback on the actual web origin printed by the dev runner, for
example `http://localhost:<web-port>/api/integrations/clickup/callback`. Vite proxies `/api` to the
environment server. Use isolated development state. Do not set `VITE_HTTP_URL` or `VITE_WS_URL`.

The current sign-in flow targets the Mac app and its locally served web UI. Web authorization
returns to Settings on the callback origin. Hosted web clients connected to a different server
origin and hosted OAuth relays are outside this pilot.

The server keeps one ClickUp account per environment. Only clients with `access:write` can
connect or disconnect it; clients with `orchestration:read` can read task data. Use one developer's
personal environment for this pilot, as agreed for the first release.

Before company rollout, verify actual OAuth sign-in, revocation/reconnection, the registered
callback, representative task payloads and attachments, and ClickUp workspace permissions.
Fixture tests are not evidence that a registered app or a live account connection works.

## Studio workflow releases

The CTO-owned workflow source is
[`studio-task-workflow`](../../apps/server/src/studio/skills/studio-task-workflow/SKILL.md).
The server bundles these instructions so every supported provider receives the same version
through Nerd's native task tools, including packaged desktop installs without source files.
After editing the skill, run `bun scripts/generate-studio-workflow.ts` from `apps/server` and
commit the generated bundle with the source. Use `--check` to detect stale output. Server
development and release builds regenerate it automatically. Active conversations load the
installed version on their next turn; an app update must interrupt and resume running work
before new instructions take effect.
