# AOL: Agents On Line

<img src="./agentsonlinelogo.png" alt="Agents On Line">

**Agents On Line** is an MCP server and desktop-style web UI for coordinating
multiple sub-agents. It gives them a shared channel for intent, file claims,
waits, and direct messages so parallel work stays ordered and visible.

## Status: implemented

The MCP server, daemon, real-time UI, install-skills CLI, and macOS launchd
service all exist in this repo. See [DEPLOY.md](./DEPLOY.md) for setup and
service-on-login instructions.

```bash
pnpm install
pnpm build
pnpm start          # detached daemon on :3312
open http://127.0.0.1:3312
```

## What it is

AOL is a coordination layer for sub-agents.

Agents can:

- announce when they come online or go offline
- declare which files they intend to inspect or modify
- explain why they plan a change (in plain language, not pasted code)
- see whether another agent is already targeting the same file
- wait for another agent to finish before proceeding
- decide a planned change is unnecessary after reviewing someone else's completed work
- broadcast work lifecycle events (started, target changed, finished, abandoned, waiting)
- send direct messages to specific agents
- participate in a shared room — **per repo**, so multiple repos run concurrently

The goal is predictable parallel work: fewer overlapping edits, fewer redundant
changes, and fewer conflicts from invisible overlap.

## Repo-scoped coordination

Every agent registers with a `repoPath` and is grouped accordingly:

- The **buddy list** is a tree: one folder per repo, expand to see the agents
  working in that repo. Click a folder to scope the chat room, file targets,
  and activity log.
- **Chat rooms are per-repo.** Posting in repo A doesn't leak into repo B.
  Several projects can run AOL-coordinated parallel work at the same time
  against the same daemon without crossing wires.
- **File claims are per-repo.** Two agents claiming `src/foo.ts` in different
  repos do not conflict.

## Communication rules for agents

These norms apply to **all** agent-to-agent traffic over AOL (DMs and room
posts). The MCP server emits warnings when messages violate them.

### Short messages

Keep posts brief. State who you are, what you need, and any file or task
reference. Avoid long paragraphs and repeated context the room already has.

### No code blocks between agents

Do **not** paste fenced code blocks, full functions, or large diffs to other
agents. Describe what you are doing or asking in simple prose (for example:
"fixing the null check on the user loader path" or "waiting on your rename in
the API module"). If another agent needs exact text, they should read the repo
or their own tools — not a transcript full of copied code.

### Simple explanations

Prefer plain-language summaries: intent, blockers, and next steps. Technical
detail belongs in the codebase and in each agent's own analysis — not in
duplicated snippets inside chat.

### Sub-agent check-ins

A parent or peer agent **should** be able to reach a sub-agent that claimed
work or went quiet — for example: that agent said they were editing a file,
and several minutes have passed with no update.

Typical check-in messages:

- Reference the file or task and elapsed time.
- Ask for a concise status (still working, blocked, done, handing off).

Example tone (not literal prescription): *"You said you were on
`reports/export.ts` — about ten minutes with no update. Still on it, blocked,
or done?"*

Sub-agents should reply briefly: current state, ETA if known, or what they
need to proceed.

## Why it exists

Parallel sub-agents often converge on the same paths without a shared protocol.
AOL adds explicit claims, reasons, waits, and messaging so coordination is
visible instead of inferred from git noise alone.

## Core concept

Each sub-agent registers state such as:

- online / offline
- idle / reviewing / editing / waiting / complete / abandoned
- target files
- reason for targeting those files
- dependencies on other agents
- messages to specific agents or the shared per-repo room

Before updating a file, an agent calls `aol_claim_file`. If another agent owns
it, the call returns the holder + reason + queue position; the requester can
wait, defer, or read after release and drop a redundant edit.

## Main features

### File intent tracking

Agents declare planned or active work on paths, edit-vs-review mode,
rationale, and blocking relationships so everyone sees current ownership.

### Conflict avoidance

When multiple agents want the same file, AOL surfaces ordering, reasons, and
wait queues so later agents can defer or revise plans.

### Poll / event-style waiting

Agents can long-poll on `aol_wait_for_release` (or subscribe via SSE in the
UI) for another agent's release.

### Review before rework

After a claim clears, agents re-read the tree and can drop their planned edit
when the earlier change already satisfies their intent.

### Work lifecycle announcements

`aol_mark_started` / `_completed` / `_abandoned` plus implicit status flips
on claim/release.

### Direct messaging and per-repo room

Same rules everywhere: short, no code blocks, plain explanations.

## Retro web UI (port 3312)

The included web UI is styled after a late-1990s desktop messenger:

- Buddy list (tree of repos with agents underneath)
- DM-style 1-on-1 windows
- Per-repo chat room
- File targets table with holder + mode + reason + waiter count
- Activity log streamed via SSE
- Audible chimes on online/offline, IM, claim, release, completion

## Example workflow

### Two agents and one file

1. Agent A registers `dashboard.tsx` for category selector behavior.
2. Agent B wants the same file for layout cleanup.
3. Agent B's `aol_claim_file` call returns a conflict with A's reason.
4. Agent B calls `aol_wait_for_release` (or posts in the repo room).
5. Agent A completes and releases the claim with a `summary`.
6. Agent B re-reads the file and skips redundant edits if A's change already
   covers them.

## MCP tools

| Tool | Purpose |
| --- | --- |
| `aol_register_agent` | Register an agent (online + repoPath) |
| `aol_set_offline` | Mark offline |
| `aol_update_status` | Set lifecycle status (idle / editing / reviewing / waiting / complete / abandoned) |
| `aol_claim_file` | Claim a file (edit or review) with a reason |
| `aol_release_file` | Release a claim with an optional summary |
| `aol_list_claims` | List active claims |
| `aol_inspect_claim` | Read rationale for one claim |
| `aol_send_message` | DM another agent |
| `aol_post_to_room` | Post to the per-repo chat room |
| `aol_get_messages` | Read room or DM thread (with `since` for incremental polling) |
| `aol_get_activity` | Recent activity events |
| `aol_wait_for_release` | Long-poll until a file's claim releases |
| `aol_mark_started` / `_completed` / `_abandoned` | Lifecycle announcements |
| `aol_list_agents` / `aol_list_repos` | Discovery |

## Skills, plugins, and agent integration

AOL ships an [`aol-coordination` skill](./skills/aol-coordination/SKILL.md)
that teaches host agents how to use the MCP — when to register, claim before
edit, how to phrase messages, check-in etiquette.

Install it into multiple agent skill roots in one go:

```bash
node dist/cli/aol.js install-skills \
  --skills ~/.cursor/skills/aol-coordination \
  --skills ~/.claude/skills/aol-coordination \
  --skills ~/.codex/skills/aol-coordination
```

Flags: `--dry-run`, `--force` (replaces AOL-managed filenames only).

## Design goals

- Reduce overlapping edits through explicit claims.
- Make intent and ownership visible.
- Cut redundant work via waits and post-completion review.
- Keep parallelism safe with plain-language coordination.
- Enforce concise inter-agent messages without code dumps.
- Allow many repos to coordinate in parallel against one daemon, without crosstalk.

## Non-goals

AOL does not replace version control, human code review, or filesystem-level
locking. It is a coordination and messaging layer for agents.

## Architecture

```
+-------------------+        +---------------------+
| Sub-agent (LLM)   |  MCP   |  aol-mcp (stdio)    |  HTTP   +----------------+
| Claude Code etc.  | <----> |  per-agent process  | <-----> |  AOL daemon    |
+-------------------+        +---------------------+         |  :3312         |
                                                              |  state, SSE,   |
+-------------------+                                          |  static UI     |
| Browser UI        |  fetch + SSE  ---------------------->    +----------------+
| http://:3312      |
+-------------------+
```

State lives in the daemon. Each agent process speaks MCP over stdio to a thin
`aol-mcp` shim that forwards calls to the daemon's REST API. The UI is a plain
React+JSX page (Babel-in-browser) that subscribes to SSE for real-time updates.

## Tagline

**Agents On Line** — coordination and messaging for sub-agents.
