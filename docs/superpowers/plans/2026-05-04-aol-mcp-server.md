# AOL MCP Server Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the AOL (Agents On Line) MCP server, real backend, real-time UI, repo-scoped buddy folders & chatrooms, install-skills CLI, macOS launchd service, and verify with 3 parallel subagents coordinating an edit to `test.md`.

**Architecture:**
- A single long-running **daemon** owns state (agents, claims, messages per-repo). It listens on port **3312** and serves both the UI and a REST + Server-Sent-Events API.
- The **MCP server** is a thin stdio process per agent that translates MCP tool calls into HTTP requests against the daemon. It auto-spawns the daemon if not running.
- A **CLI** (`aol`) provides `start|stop|status|install-skills|agent` for ops + script-based agent calls (used by subagents in tests).
- The UI is the existing JSX mockups, rewired to subscribe to real SSE events; "buddy folders" group agents by `repoPath`; chatrooms are per-repo.

**Tech Stack:** TypeScript, pnpm, Node 20+, `@modelcontextprotocol/sdk`, native `node:http`, vitest, retro JSX UI (existing).

---

## Task 1: Repo scaffold

**Files:** `package.json`, `pnpm-workspace.yaml`(no), `tsconfig.json`, `.gitignore`, `src/`

- Init pnpm package with TS + tsx + MCP SDK + vitest.
- tsconfig: NodeNext, ES2022, strict, outDir `dist`, src `src`.
- bin entries: `aol` -> `dist/cli/aol.js`, `aol-mcp` -> `dist/mcp/index.js`.
- scripts: `build`, `dev`, `start`, `stop`, `status`, `restart`, `service:install`, `service:uninstall`, `kill`, `test`.

## Task 2: Shared types

**Files:** `src/shared/types.ts`

- `AgentStatus = 'online'|'offline'|'idle'|'editing'|'reviewing'|'waiting'|'complete'|'abandoned'`
- `Agent { id, name, repoPath, status, currentFile?, reason?, waitingOn?, lastSeen, color? }`
- `Claim { id, agentId, repoPath, file, mode:'edit'|'review', reason, startedAt, releasedAt? }`
- `Message { id, repoPath, from, to (null for room), kind:'msg'|'system', body, ts }`
- `ActivityEvent { id, repoPath, kind:'online'|'offline'|'claim'|'release'|'msg'|'status'|'wait'|'complete'|'abandon', agentId, target?, body?, ts }`
- `BroadcastEvent` discriminated union for SSE.

## Task 3: State store

**Files:** `src/daemon/state.ts`, `tests/state.test.ts`

In-memory store with maps keyed by id; methods:
- `registerAgent`, `markOffline`, `setStatus`
- `claimFile` (rejects duplicate active claim on same {repo, file}; supports queueing waiters)
- `releaseFile` (clears claim; flips waiters to a status update, returns peers who were waiting)
- `listClaims(repo?)`, `listAgents(repo?)`, `getAgent`, `inspectClaim`
- `addMessage`, `getMessages(repo, since?, dmFilter?)`
- `addActivity`, `getActivity(repo?, since?, limit)`
- `listRepos()`
- Tests for: register/online/offline; claim conflicts; queue & release; listings filtered by repo.

## Task 4: Event bus + SSE

**Files:** `src/daemon/events.ts`

EventEmitter wrapper that fans out structured events to subscribers. Used by HTTP SSE handler + persisted into activity log.

## Task 5: HTTP server (REST + SSE + static)

**Files:** `src/daemon/server.ts`, `src/daemon/routes.ts`

REST endpoints (all JSON):
- `POST /api/agents` register, body `{id?, name, repoPath, color?}` → returns `{agent}`
- `POST /api/agents/:id/offline`
- `POST /api/agents/:id/status` `{status, currentFile?, reason?, waitingOn?}`
- `POST /api/agents/:id/heartbeat`
- `POST /api/claims` `{agentId, file, mode, reason}` → 201 or 409 with conflict info
- `POST /api/claims/:id/release` `{summary?}`
- `GET /api/claims?repoPath=...`
- `GET /api/claims/:id`
- `POST /api/messages` `{repoPath, from, to?, body}`
- `GET /api/messages?repoPath=...&since=...&peer=...`
- `GET /api/activity?repoPath=...&since=...&limit=...`
- `GET /api/agents?repoPath=...`
- `GET /api/repos`
- `POST /api/wait` `{agentId, repoPath, file, timeoutMs?}` long-poll until release/timeout
- `GET /api/events?repoPath=...` SSE
- `GET /api/health`
- Static: `GET /` and `/*.{jsx,css,png,html}` from `public/`

Server saves PID file at `~/.aol/daemon.pid`; refuses to start if already up.

## Task 6: MCP server (stdio)

**Files:** `src/mcp/index.ts`

Use `@modelcontextprotocol/sdk` Server with stdio transport. Tools (names mirror README):
- `register_agent` `{name, repoPath, id?}`
- `set_offline` `{agentId}`
- `update_status` `{agentId, status, currentFile?, reason?, waitingOn?}`
- `claim_file` `{agentId, file, mode, reason}` returns claim or conflict (current holder, reason, queue position).
- `release_file` `{claimId, summary?}`
- `list_claims` `{repoPath?}`
- `inspect_claim` `{claimId}`
- `send_message` `{from, to, body}` (validates short, no fenced code → returns warning if violates)
- `post_to_room` `{from, repoPath, body}`
- `get_messages` `{repoPath, since?, peer?}`
- `get_activity` `{repoPath?, since?, limit?}`
- `wait_for_release` `{agentId, repoPath, file, timeoutMs?}`
- `mark_started|mark_completed|mark_abandoned` `{agentId, file?, summary?}`
- `list_agents` `{repoPath?}`, `list_repos`
- Auto-spawn daemon if not reachable; retry once with 1.5s wait.
- Each tool description includes the README rules (short msgs, no code blocks, claim before edit).

## Task 7: HTTP client used by MCP + CLI

**Files:** `src/shared/client.ts`

Tiny fetch-based client with retry+autospawn-on-ECONNREFUSED.

## Task 8: CLI

**Files:** `src/cli/aol.ts`

Commands:
- `aol start` (foreground/daemon based on `--detach`); `aol stop` (read PID, SIGTERM); `aol status`; `aol restart`; `aol kill` (force).
- `aol install-skills --skills <dir> [--skills <dir>...] [--dry-run] [--force]`
- `aol agent ...` thin wrapper for the same operations as MCP, used by test subagents (since they run via Bash).

## Task 9: UI rewire

**Files:** `public/index.html`, `public/aol-core.jsx`, `public/aol-windows.jsx`, `public/aol-app.jsx`, `public/retro.css`, `public/agentsonlinelogo.png` (copied from existing files)

Changes:
- Drop scripted `ROOM_SCRIPT`/`DM_SCRIPTS`/`transitions`/`AOL_DATA.YOU` mocks.
- Add `aol-net.js` global with `subscribe(repoPath)`, `send`, etc., wrapping `fetch` + EventSource.
- BuddyList becomes a tree: top-level **repo folders** (one per repoPath), expand to show online agents under that repo. Use existing folder-icon style. Sign-on flow: pick repo from dropdown of known repos (or default to `__global__`).
- ChatRoom becomes per-repo; the title is `Chat — <repoBasename>`. DMs unchanged but routed via API.
- FileTargets shows claims for the **selected repo** (clickable repos in BuddyList scope it).
- ActivityLog scoped to selected repo (or "all").
- Replace `signOn` with: choose displayed name + repo path → `POST /api/agents`.
- `AudioFx` retained; play on real events.

## Task 10: Skill artifact

**Files:** `skills/aol-coordination/SKILL.md`

Document: when to register, claim before edit, short messages no code blocks, check-in cadence, wait/release patterns, examples.

## Task 11: macOS launchd service

**Files:** `service/com.aol.daemon.plist.template`, `scripts/install-service.sh`, `scripts/uninstall-service.sh`

Template uses `{{NODE_PATH}}` and `{{REPO_PATH}}` placeholders; install-service substitutes and copies to `~/Library/LaunchAgents/com.aol.daemon.plist`, `launchctl load`.

## Task 12: Deploy/Ops doc

**Files:** `DEPLOY.md`

Sections: prerequisites, install, run manually, run as launchd service (boot start), stop/kill, logs at `~/.aol/`, ports & override, MCP integration (Claude Code, Cursor), uninstall.

## Task 13: README update

**Files:** `readme.md`

- Note: now implemented; ports; quickstart link to DEPLOY.md.
- Add **repo-scoped** language: "Buddy List groups agents by repo (folder per repo)" and "Chatrooms are per-repo".
- Mark MCP tools section actual not planned.
- Update CLAUDE.md note that the prototype is now backed by a real server.

## Task 14: CLAUDE.md update

Reflect the new architecture so future Claude sessions don't think it's still a mock.

## Task 15: Smoke test integration with 3 subagents

- Daemon up, UI viewable in Chrome via chrome-devtools-mcp.
- Create `playground/test-repo/test.md` with lorem ipsum.
- Spawn 3 Task subagents in parallel (`general-purpose`). Each given: their agent id, repoPath, the path to test.md, and the rule "use `aol agent ...` Bash CLI to coordinate". They each want to add a different section. They must register, claim (or wait), discuss in the room, finalize edits without overlap.
- After they finish: verify file content reflects all three changes; verify activity log shows the coordination; capture screenshots.

---

## Self-Review

- Spec coverage:
  - Online/offline ✓ (T3, T6, T9)
  - Claim/release ✓
  - Reasons ✓
  - Wait/poll ✓ (`/api/wait`, `wait_for_release`)
  - Review-before-rework: covered via `inspect_claim` + agents reading file post-release (workflow guidance in skill)
  - Lifecycle (start/complete/abandon) ✓
  - DM + room ✓; rules surface in tool descriptions and in skill
  - Sub-agent check-ins: short-msg/no-code-block validation in `send_message` (warn) + skill guidance
  - UI port 3312 ✓
  - Sound cues ✓
  - `aol-install-skills` ✓
- Repo-scoped buddy folders + per-repo rooms ✓ (T9)
- Service-on-boot + kill ✓ (T11, T8)
- 3-subagent integration test ✓ (T15)
