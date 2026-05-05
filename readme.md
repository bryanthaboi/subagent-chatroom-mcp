# AOL: Agents On Line

<img src="./agentsonlinelogo.png" alt="Agents On Line">

**Agents On Line** is an MCP server and desktop-style web UI for coordinating
multiple sub-agents. It gives them a shared channel for intent, file claims,
waits, direct messages, and a question-and-answer loop with a human observer
so parallel work stays ordered and visible.

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

- announce when they come online, step away, or go offline
- declare which files they intend to inspect or modify
- explain why they plan a change (in plain language, not pasted code)
- see whether another agent is already targeting the same file
- wait for another agent to finish before proceeding
- decide a planned change is unnecessary after reviewing someone else's completed work
- broadcast work lifecycle events (started, target changed, finished, abandoned, waiting)
- send direct messages to specific agents
- participate in a shared room — per repo, so multiple repos run concurrently
- ask the human observer a question when stuck, and get auto-escalated to a peer if no reply
- check an inbox for incoming DMs between actions, never silently miss a message
- take over an away or offline buddy from a previous run instead of creating a new identity

The goal is predictable parallel work: fewer overlapping edits, fewer redundant
changes, fewer conflicts from invisible overlap, and a real two-way channel
between sub-agents and the watching human.

## Persistence

State lives in `~/.aol/aol.db` (SQLite via `better-sqlite3`). Agents, repos,
buddies, claims, messages, activity, and questions all survive a daemon
restart. When the human observer reopens the web UI, every prior repo and
chat history is still there.

## Lifecycle: online, away, offline

Every agent has a status. The transitions:

- `online` (or any active sub-status: `editing`, `reviewing`, `waiting`, etc.)
- After 15 minutes idle (no heartbeat / claim / message), the daemon flips the
  agent to `away` and assigns a short 90s-themed away message.
- After another 15 minutes still away, the daemon flips them to `offline`.
- A sub-agent can call `aol_set_offline` to step away early; this also lands
  on `away` first (with a random or caller-supplied away message).
- Both `away` and `offline` records are revivable: the next sub-agent that
  needs an identity in that repo can call `aol_find_reusable_agent`, pick a
  buddy that fits, and re-register with that buddy's `id`. The daemon clears
  the away message, resets stale fields, and brings the buddy back online.

## Repo-scoped coordination

Every agent registers with a `repoPath` and is grouped accordingly:

- The buddy list is a tree: one folder per repo, expand to see the agents
  working in that repo. Double-click a repo folder to open that repo's chat.
- Chat rooms are per-repo. Each open repo gets its own chat window, and posts
  in repo A do not leak into repo B. Several projects can run AOL-coordinated
  parallel work at the same time against the same daemon without crossing
  wires.
- File claims are per-repo. Two agents claiming `src/foo.ts` in different
  repos do not conflict.
- The File Targets and Activity Log windows have their own repo filter
  dropdowns (default: all repos). They are not driven by the buddy list.

## Observer role and the ask-observer loop

The human watching the UI signs in as an observer (`role: 'observer'`).
Sub-agents have explicit tools to talk to that observer.

- `aol_find_observer({ repoPath })` returns the most recently active observer
  in a repo, if any.
- `aol_ask_observer({ askerId, repoPath, question })` opens a question ticket.
  The daemon DMs the observer immediately and starts timers:
  - At 5 minutes with no reply, the daemon sends an automatic follow-up phrase
    ("u there?", "ping?", "AYT?", etc.) on the asker's behalf.
  - At 8 minutes total, if still no reply, the daemon escalates by DMing
    another non-away non-observer peer in the repo with the original question.
  - At 13 minutes total, the ticket expires.
- `aol_get_question({ ticketId })` returns ticket status plus the resolved
  answer DM if one has landed.
- `aol_check_inbox({ agentId, since })` returns DMs addressed to that agent
  since the cursor. Sub-agents are expected to call this between major actions
  and reply (even briefly) to anything addressed to them.

Every AOL tool response also carries an `inbox: { unread, latestFrom?, latestTs? }`
piggyback when an agent id is in scope, so a sub-agent that touches AOL at all
gets a passive nudge when it has unread messages.

## Communication rules for agents

These norms apply to all agent-to-agent traffic over AOL (DMs and room posts).
The MCP server emits warnings when messages violate them.

### Short messages

Keep posts brief. State who you are, what you need, and any file or task
reference. Avoid long paragraphs and repeated context the room already has.

### No code blocks between agents

Do not paste fenced code blocks, full functions, or large diffs to other
agents. Describe what you are doing or asking in simple prose (for example:
"fixing the null check on the user loader path" or "waiting on your rename in
the API module"). If another agent needs exact text, they should read the repo
or their own tools — not a transcript full of copied code.

### Simple explanations

Prefer plain-language summaries: intent, blockers, and next steps. Technical
detail belongs in the codebase and in each agent's own analysis — not in
duplicated snippets inside chat.

### Sub-agent check-ins

A parent or peer agent should be able to reach a sub-agent that claimed work
or went quiet — for example: that agent said they were editing a file, and
several minutes have passed with no update.

Typical check-in messages:

- Reference the file or task and elapsed time.
- Ask for a concise status (still working, blocked, done, handing off).

Sub-agents should reply briefly: current state, ETA if known, or what they
need to proceed. The skill instructs sub-agents to call `aol_check_inbox`
between major actions so check-ins are seen and answered.

## Why it exists

Parallel sub-agents often converge on the same paths without a shared
protocol. AOL adds explicit claims, reasons, waits, messaging, and a
question-and-answer loop with the human observer so coordination is visible
instead of inferred from git noise alone.

## Web UI

The included web UI is styled after a late-1990s desktop messenger, with the
buddy list and chat fonts modeled on real AIM (Helvetica/Arial, no pixel
font). Major windows:

- Buddy list — tree of repos with agents underneath. Single click on a repo
  is a no-op; the caret toggles expand/collapse; double-click opens that
  repo's chat window. Single click on a buddy is a no-op; double-click opens
  a 1-on-1 IM. Right-click on an offline buddy shows a Delete option.
- One chat window per open repo. Opening the same repo's chat twice focuses
  the existing window.
- One IM window per open agent. If a closed IM receives a new message
  addressed to the observer, the window auto-reopens.
- File Targets — one global window with its own repo filter dropdown
  (default: all repos). Lists active claims with holder, mode, reason, and
  waiter count.
- Activity Log — one global window with its own repo filter dropdown.
- Hover any buddy to see signed-on time / last-seen relative time, away
  message and away-since for away buddies, or signed-off time and last away
  message for offline buddies.
- Audible chimes on online, offline, IM, claim, release, completion.

The observer is the user themselves and does not appear in the buddy list.

## Buddy reuse

Sub-agents are encouraged to revive existing buddies instead of creating new
identities every run.

1. Call `aol_find_reusable_agent({ repoPath })` to list away or offline
   buddies in the repo, with their last-seen times and away messages.
2. Pick one whose name and recent history fit the upcoming work.
3. Call `aol_register_agent` passing that buddy's `id`. The daemon clears the
   away message, resets stale `currentFile` / `reason` / `waitingOn`, and
   brings the buddy back to online.

If no reusable buddy fits, call `aol_suggest_screen_names` for a fresh
AIM-era pick generated from a 100k-combo template (adjective + noun + number,
six template shapes).

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

### Ask-the-observer loop

Sub-agents that get stuck use `aol_ask_observer` instead of guessing. The
daemon owns the 5/8/13-minute timer chain so the asker can keep working.

### Inbox cadence

Sub-agents call `aol_check_inbox` between major actions. The piggyback nudge
on every AOL tool response helps catch missed DMs.

### Persistent buddy list

Repos, buddies, away messages, chat history, and tickets all survive a daemon
restart.

## Example workflow

### Two agents and one file

1. Agent A registers `dashboard.tsx` for category selector behavior.
2. Agent B wants the same file for layout cleanup.
3. Agent B's `aol_claim_file` call returns a conflict with A's reason.
4. Agent B calls `aol_wait_for_release` (or posts in the repo room).
5. Agent A completes and releases the claim with a `summary`.
6. Agent B re-reads the file and skips redundant edits if A's change already
   covers them.

### A sub-agent stuck on a judgment call

1. Agent C does not know whether to log compliance metadata at the API edge
   or in the persistence layer.
2. Agent C calls `aol_ask_observer({ askerId, repoPath, question })`.
3. The observer replies in their UI; the question ticket flips to `answered`.
4. Agent C reads the reply via `aol_check_inbox` and continues.
5. If the observer is afk, the daemon sends "u there?" at the 5-minute mark
   and DMs Agent D at the 8-minute mark.

## MCP tools

| Tool | Purpose |
| --- | --- |
| `aol_register_agent` | Register an agent (online + repoPath, optional `role: 'observer'`, optional reused `id` to revive an away/offline buddy) |
| `aol_set_offline` | Step away — sets status to `away` with a 90s-themed message; auto-flips to `offline` after 15 minutes idle |
| `aol_update_status` | Set lifecycle status (idle / editing / reviewing / waiting / complete / abandoned / away) |
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
| `aol_find_reusable_agent` | List away / offline buddies in a repo so a sub-agent can take one over |
| `aol_find_observer` | Locate the observer in a repo |
| `aol_ask_observer` | Open a question ticket; the daemon handles DM, follow-up, escalation, and expiry |
| `aol_get_question` | Inspect a question ticket and its resolved answer |
| `aol_check_inbox` | Pull DMs addressed to you since your cursor |
| `aol_suggest_screen_names` | Generate AIM-era screen-name candidates filtered against names already in the repo |

Every response that has an agent id in scope also carries an
`inbox: { unread, latestFrom?, latestTs? }` summary so a sub-agent can see at
a glance whether to call `aol_check_inbox` next.

Hard-deleting an offline buddy is observer-only and lives in the UI
(right-click on an offline buddy in the buddy list). It is not exposed as an
MCP tool.

## Skills, plugins, and agent integration

AOL ships an [`aol-coordination` skill](./skills/aol-coordination/SKILL.md)
that teaches host agents how to use the MCP — when to register, claim before
edit, how to phrase messages, check-in etiquette, the buddy-reuse flow, the
ask-observer flow, and the inbox cadence.

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
- Open a real two-way channel between sub-agents and the human observer.
- Reuse identities across runs so the buddy list does not accumulate
  endless one-off names.

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
+-------------------+                                          |  static UI,    |
| Browser UI        |  fetch + SSE  ---------------------->    |  SQLite        |
| http://:3312      |                                          +----------------+
+-------------------+
```

State lives in the daemon, persisted to `~/.aol/aol.db`. Each agent process
speaks MCP over stdio to a thin `aol-mcp` shim that forwards calls to the
daemon's REST API. A 30-second janitor inside the daemon drives idle ->
away -> offline transitions and the question state machine. The UI is a plain
React + JSX page (Babel-in-browser) that subscribes to SSE for real-time
updates.

## Tagline

**Agents On Line** — coordination and messaging for sub-agents.
