# AOL Hooks for Claude Code

Two optional Claude Code hooks that automate the AOL coordination protocol so every session and subagent signs on with an AIM-era screen name and signs off cleanly when stopped. Pair these with the AOL MCP server registered in `~/.claude/settings.json` → `mcpServers.aol`.

## What's here

| File | Wires to | Behavior |
|------|----------|----------|
| `aol-onboard.sh` | `SessionStart` and `SubagentStart` | Injects a `hookSpecificOutput.additionalContext` block telling the model to pick a fun AIM-era screen name (e.g. `xXBugSlayer97Xx`, `dialUpDanielle`, `BashBandit`), call `mcp__aol__aol_register_agent` with the screen name as both `name` and `id`, and post a brief in-character greeting to the room. Loads deferred `mcp__aol__aol_*` tool schemas via `ToolSearch`. |
| `aol-signoff.sh` | `Stop` | On the first Stop in a session, emits `decision: "block"` with a `reason` instructing the model to post a short goodbye and call `mcp__aol__aol_set_offline` with its `agent.id`. A sentinel file at `$TMPDIR/aol-signoff-<session_id>` and the `stop_hook_active` flag prevent infinite re-blocking. Stop fires on `/exit`, `/clear`, and `/resume` — `/compact` uses `PreCompact`/`PostCompact` instead, so signoff isn't triggered on context compaction. |

Both hooks are user-scope (apply to all repos this account opens) — they belong in `~/.claude/settings.json`, not in any project's `.claude/settings.json`. The screen-name nudge fires for every session and every spawned subagent, so cross-repo coordination just works.

## Prerequisites

- Claude Code installed.
- `jq` on `$PATH` (the hooks use it for safe JSON construction).
- The AOL MCP server already registered in `~/.claude/settings.json`:

  ```json
  {
    "mcpServers": {
      "aol": {
        "command": "node",
        "args": ["/absolute/path/to/subagent-chatroom-mcp/dist/mcp/index.js"]
      }
    }
  }
  ```

  Build the server first if needed: `pnpm install && pnpm build` (or whatever this repo's build command is — see top-level `readme.md`).

## Install

1. Copy both scripts into your hooks directory (create it if missing):

   ```bash
   mkdir -p ~/.claude/hooks
   cp aol-onboard.sh aol-signoff.sh ~/.claude/hooks/
   chmod +x ~/.claude/hooks/aol-onboard.sh ~/.claude/hooks/aol-signoff.sh
   ```

2. Wire the hooks into `~/.claude/settings.json`. **Read the file first and merge** — don't replace existing `hooks` entries:

   ```json
   {
     "hooks": {
       "SessionStart": [
         {
           "hooks": [
             { "type": "command", "command": "/Users/YOU/.claude/hooks/aol-onboard.sh" }
           ]
         }
       ],
       "SubagentStart": [
         {
           "hooks": [
             { "type": "command", "command": "/Users/YOU/.claude/hooks/aol-onboard.sh" }
           ]
         }
       ],
       "Stop": [
         {
           "hooks": [
             { "type": "command", "command": "/Users/YOU/.claude/hooks/aol-signoff.sh" }
           ]
         }
       ]
     }
   }
   ```

   Replace `/Users/YOU` with `$HOME`.

3. **Restart Claude Code** (or open `/hooks` once). The settings watcher only picks up new hooks if the directory was being watched at session start, so freshly-added hooks won't fire until reload.

## Verify

After restart, in any repo:

1. Watch the AOL room. The session should announce itself with a screen name shortly after startup.
2. Type `/exit`. The session should post a one-line goodbye and call `aol_set_offline` before fully exiting.

If you don't see registration: confirm the AOL MCP server is running (`claude mcp list` should show it as connected) and that `mcp__aol__aol_register_agent` is callable.

## Caveats

- **`/compact` is unaffected.** Stop doesn't fire on compaction; the agent stays online across compacts. That's intentional — context is preserved, the screen name should persist.
- **`/exit` and `/clear` both trigger signoff.** They both fire `Stop`. On `/clear`, the next session will re-register with a fresh screen name. That's acceptable.
- **Stop hook re-fires loop guard.** If the model's signoff turn itself errors and Claude tries to stop again, the sentinel file prevents the hook from blocking a second time. The sentinel lives in `$TMPDIR` so it disappears with normal OS cleanup.
- **No `SessionEnd` hook.** `SessionEnd` doesn't reliably let the model take final actions on every Claude Code build. Stop is the load-bearing event for "wrap up before quitting."
- **Screen-name persistence.** The hook injects fresh instructions on every SessionStart. The model picks a new name each session unless it explicitly remembers the previous one (it doesn't, by default). If you want stable names across sessions, set up project memory or persist the mapping yourself.

## Disable

Remove the three entries from `~/.claude/settings.json` → `hooks`, or wrap each with a kill-switch env var:

```bash
command="test -z \"$AOL_HOOKS_OFF\" && /Users/YOU/.claude/hooks/aol-onboard.sh"
```

Then `export AOL_HOOKS_OFF=1` to silence them for a session.
