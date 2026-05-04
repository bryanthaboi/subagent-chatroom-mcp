---
name: aol-coordination
description: Use whenever you are running as one of several parallel sub-agents and may touch shared files, share work with peers, or need to coordinate intent. Wires you into AOL — the per-repo coordination MCP — so you announce online status, claim files before editing, wait on conflicts, and post short coordination messages instead of stomping on each other.
---

# AOL — Agents On Line: coordination protocol

You are one of multiple sub-agents working in parallel. AOL gives you a shared
channel (per-repo) for intent, file claims, waits, and direct messages. Use it.

## Identify yourself first

On every run, call `aol_register_agent` once with:
- `name` — short identifier visible to peers (e.g. `bug-fixer`, `doc-writer`).
- `repoPath` — the absolute repo path you are working in (run `pwd` if unsure).
- `id` — a stable id you keep using for the rest of the session.

Save the returned `agent.id` and reuse it. AOL will create a folder for your
repo in the buddy list and put you under it.

## Claim before you edit

Before editing any file, call `aol_claim_file` with:
- `agentId`
- `file` — repo-relative path
- `mode` — `edit` (you'll modify) or `review` (you'll only read with intent)
- `reason` — plain prose: what you intend, why. Not code.

If the response is `ok: false` (conflict), DO NOT edit. You have three options:

1. `aol_wait_for_release` — long-poll until the holder releases.
2. `aol_post_to_room` and propose a different sequencing.
3. After the holder finishes, **re-read the file** and consider whether your
   change is still needed. The README's whole "review before rework" idea is
   that you may discover the holder's edit already covers your case.

When you're done, `aol_release_file` with a short `summary`.

## Talk to peers — short, plain prose

Two channels:
- `aol_post_to_room` — shared room for the repo.
- `aol_send_message` — direct message to one peer (`to: <agentId>`).

Rules (these are enforced softly — the server returns warnings):
- **Short** — one or two sentences. State who you are, what you need, and the
  file/task you're talking about.
- **No fenced code blocks**, no copied diffs, no quoted snippets. Describe
  intent in prose. If a peer needs exact text they should read the repo.
- **No long context dumps.** The other agents have their own state and tools.

Examples (tone, not literal templates):

- "claiming `src/router.ts` to split the redirect chain into a table; ~5 min"
- "@alice waiting on your `payments.ts` edit — i'm queued for the same file"
- "you said `reports/export.ts` 12 min ago, no update. still on it, blocked, or done?"

## Check in on quiet peers

If a peer claimed a file and went quiet, send a short DM referencing the file
and elapsed time, asking for a one-line status: still working / blocked / done /
handing off. Don't pile on, don't write paragraphs.

## Lifecycle

- `aol_mark_started` when you begin meaningful work.
- `aol_mark_completed` when you finish. Pair with `aol_release_file` if you
  held a claim.
- `aol_mark_abandoned` if your planned edit became unnecessary after re-reading
  someone else's completed work.

## When to use `wait_for_release` vs `post_to_room`

- Use `wait_for_release` when you genuinely need that file and your edit can't
  start until the holder finishes. Set a timeout you can live with.
- Use `post_to_room` when there might be a sequencing question (does it make
  sense for me to even do this if Alice is already doing X?). Give the room
  ~30s to weigh in.

## Things to avoid

- Don't paste code or diffs into messages. Ever. Describe in prose.
- Don't claim a file you don't actually need yet. Claim narrowly.
- Don't release silently. Always include a `summary` so peers can decide
  whether to drop their planned change.
- Don't ignore conflicts. If `claim_file` returns a conflict, wait or revise —
  do not edit anyway.

## Tooling cheat sheet

| Tool | When |
| --- | --- |
| `aol_register_agent` | once, at startup |
| `aol_claim_file` | before any edit |
| `aol_wait_for_release` | when conflict and you still need the file |
| `aol_release_file` | after edit, with summary |
| `aol_post_to_room` | broad coordination, "is anyone else…?" |
| `aol_send_message` | targeted DM to one peer |
| `aol_get_messages` | poll for incoming room/DM activity |
| `aol_get_activity` | recent activity log for the repo |
| `aol_list_claims` | who's holding what right now |
| `aol_inspect_claim` | rationale for a specific claim |
| `aol_mark_started` / `_completed` / `_abandoned` | lifecycle announcements |
| `aol_set_offline` | optional — at end of session |

The point is *predictable parallel work*: fewer overlapping edits, fewer redundant
changes, fewer conflicts from invisible overlap. Use the tools.
