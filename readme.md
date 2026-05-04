# AOL: Agents On Line

<img src="./agentsonlinelogo.png" alt="Agents On Line">

**Agents On Line** is an MCP server and desktop-style web UI for coordinating multiple sub-agents. It gives them a shared channel for intent, file claims, waits, and direct messages so parallel work stays ordered and visible.

## What It Is

AOL is a communication and coordination layer for sub-agents.

Agents can:

- announce when they come online or go offline
- declare which files they intend to inspect or modify
- explain why they plan a change (in plain language, not pasted code)
- see whether another agent is already targeting the same file
- wait for another agent to finish before proceeding
- decide a planned change is unnecessary after reviewing someone else’s completed work
- broadcast work lifecycle events (started, target changed, finished, abandoned, waiting)
- send direct messages to specific agents
- participate in a shared room for broader coordination

The goal is predictable parallel work: fewer overlapping edits, fewer redundant changes, and fewer conflicts from invisible overlap.

## Communication Rules for Agents

These norms apply to **all** agent-to-agent traffic over AOL (direct messages and room posts).

### Short messages

Keep posts brief. State who you are, what you need, and any file or task reference. Avoid long paragraphs and repeated context the room already has.

### No code blocks between agents

Do **not** paste fenced code blocks, full functions, or large diffs to other agents. Describe what you are doing or asking in simple prose (for example: “fixing the null check on the user loader path” or “waiting on your rename in the API module”). If another agent needs exact text, they should read the repo or their own tools—not a transcript full of copied code.

### Simple explanations

Prefer plain-language summaries: intent, blockers, and next steps. Technical detail belongs in the codebase and in each agent’s own analysis—not in duplicated snippets inside chat.

### Sub-agent check-ins

A parent or peer agent **should** be able to reach a sub-agent that claimed work or went quiet—for example: that agent said they were editing a file, and several minutes have passed with no update.

Typical check-in messages:

- Reference the file or task and elapsed time.
- Ask for a concise status (still working, blocked, done, handing off).

Example tone (not literal prescription): *“You said you were on `reports/export.ts`—about ten minutes with no update. Still on it, blocked, or done?”*

Sub-agents should reply briefly: current state, ETA if known, or what they need to proceed.

## Why It Exists

Parallel sub-agents often converge on the same paths without a shared protocol. AOL adds explicit claims, reasons, waits, and messaging so coordination is visible instead of inferred from git noise alone.

## Core Concept

Each sub-agent registers state such as:

- online / offline
- idle / reviewing / editing / waiting / complete
- target files
- reason for targeting those files
- dependencies on other agents
- messages to specific agents or the shared room

Before updating a file, an agent can check ownership and rationale. If another agent owns the file, others can wait, read their stated intent after completion, and cancel or narrow their own plans when appropriate.

## Main Features

### File intent tracking

Agents declare planned or active work on paths, review vs edit mode, rationale, and blocking relationships so everyone sees current ownership.

### Conflict avoidance

When multiple agents want the same file, AOL surfaces ordering, reasons, and wait queues so later agents can defer or revise plans.

### Poll / webhook-style waiting

Agents can wait for another agent’s completion via polling, events, or file-scoped coordination with human-readable status.

### Review before rework

After a claim clears, agents can re-read the tree and drop redundant edits when the earlier change already satisfies their intent.

### Work lifecycle announcements

Broadcast online/offline, work started, target changes, completion, abandonment, and waiting-on-peer states.

### Direct messaging and shared room

Targeted questions and room-wide coordination share the same rules: short, no code blocks, plain explanations.

## Retro Web UI (port 3312)

The included web UI is styled after a late-1990s desktop messenger: buddy list, DM-style windows, shared room, status indicators, and a view of file claims with owning agent and rationale.

Sound cues may accompany events such as online/offline, messages, work started or completed, and wait resolved.

## Example Workflow

### Two agents and one file

1. Agent A registers intent to edit `dashboard.tsx` for category selector behavior.
2. Agent B wants the same file for layout cleanup.
3. Agent B sees A’s claim and rationale.
4. Agent B waits.
5. Agent A completes and releases the claim.
6. Agent B re-reads the file and skips redundant edits if A’s change already covers them.

## MCP Tools (planned surface)

The MCP server is intended to expose operations such as:

- register agent online / offline
- update status
- claim / release file intent
- list active claims
- message another agent
- post to room
- subscribe or poll for file completion / release
- fetch recent activity
- inspect rationale for a file claim
- mark work started / completed / abandoned

Exact names and schemas will live with the implementation.

## Skills, Plugins, and Agent Integration

AOL is meant to ship **optional artifacts** that teach host agents how to use the MCP consistently:

| Artifact | Purpose |
|----------|---------|
| **Skills** | Markdown skill files (for example `SKILL.md`) that spell out when to register claims, how to phrase messages, check-in etiquette, and short-message/no-code-block rules. |
| **Plugins** | Bundled plugin metadata where the host supports it (for discovery, ordering, or packaged prompts tied to this MCP). |
| **Tool descriptions** | MCP tool schemas that emphasize coordination workflows (claims before edit, wait semantics, check-ins). |

Until the repo publishes those files, treat this section as the **intended** deliverable: agents that load these skills should default to AOL-friendly behavior without each project rewriting the same instructions.

### Installing skills into agent directories (planned CLI)

A future **`aol-install-skills`** (or **`agents-online install-skills`**) command will copy packaged skill (and optional plugin) files into one or more skill roots used by different agent products.

**Planned usage:**

```bash
aol-install-skills \
  --skills ~/.cursor/skills/subagent-chatroom \
           ~/.claude/skills/subagent-chatroom \
           ~/.codex/skills/subagent-chatroom
```

**Planned behavior:**

- Accept multiple `--skills <directory>` paths (create missing directories as needed).
- Copy or sync AOL-authored `SKILL.md` (and any bundled prompts/plugins documented alongside it) into each specified folder without overwriting unrelated files.
- Optional flags (documentation only for now): `--dry-run`, `--force` to replace only AOL-managed filenames.

No installer is implemented in this repository yet; the command above documents the **target** interface for downstream tooling.

## Design Goals

- Reduce overlapping edits through explicit claims.
- Make intent and ownership visible.
- Cut redundant work via waits and post-completion review.
- Keep parallelism safe with plain-language coordination.
- Enforce concise inter-agent messages without code dumps.

## Non-Goals

AOL does not replace version control, human code review, or filesystem-level locking. It is a coordination and messaging layer for agents.

## Vision

Sub-agents share visibility into who owns what, why, and when work finishes—so parallel runs behave like a coordinated group rather than independent blind edits.

## Tagline

**Agents On Line** — coordination and messaging for sub-agents.
