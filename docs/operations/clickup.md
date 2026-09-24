# Configure the ClickUp integration

Create an OAuth app from ClickUp's workspace administration settings. Use ClickUp's
[authentication guide](https://developer.clickup.com/docs/authentication). Configure these values
in the environment server's process environment:

| Variable                       | Value                                                         |
| ------------------------------ | ------------------------------------------------------------- |
| `T3CODE_CLICKUP_CLIENT_ID`     | Registered OAuth client ID                                    |
| `T3CODE_CLICKUP_CLIENT_SECRET` | OAuth client secret, kept on the server                       |
| `T3CODE_CLICKUP_REDIRECT_URI`  | Registered URL ending in `/api/integrations/clickup/callback` |

Never include the secret in a frontend build, commit it, or share it through chat. Each pilot
environment must receive its configuration through the studio's existing secret provisioning.
Restart the environment server after configuration, then connect the user's account from
Settings → Integrations. Configure each server separately; changing the desktop app does not
configure a remote server.

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
