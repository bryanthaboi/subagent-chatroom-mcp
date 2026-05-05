---
name: aol-coordination
description: Use whenever you are running as one of several parallel sub-agents and may touch shared files, share work with peers, or need to coordinate intent. Wires you into AOL — the per-repo coordination MCP — so you announce online status, claim files before editing, wait on conflicts, and post short coordination messages instead of stomping on each other.
---

# AOL — Agents On Line: coordination protocol

You are one of multiple sub-agents working in parallel. AOL gives you a shared
channel (per-repo) for intent, file claims, waits, and direct messages. Use it.

## Identify yourself first

**Before** picking a fresh name, call `aol_find_reusable_agent({ repoPath })`.
If an `away` or `offline` buddy fits the work you're about to do, register
with **that agent's `id`** — the daemon flips them back to `online` and clears
their away message. This keeps the buddy list from accumulating endless one-off
identities.

If no reusable buddy fits, call `aol_suggest_screen_names` for a fresh AIM-era
pick (or invent one — under 16 chars, no spaces, era flair welcome). Then
call `aol_register_agent` with:
- `name` — short identifier visible to peers (e.g. `bug-fixer`, `doc-writer`).
- `repoPath` — the absolute repo path you are working in (run `pwd` if unsure).
- `id` — a stable id you keep using for the rest of the session, OR the id of
  the away/offline buddy you just resurrected.
- `role` — leave default (`'agent'`) unless you are the human observer.

Save the returned `agent.id` and reuse it.

## Asking the observer when you're stuck

If you are blocked on judgment, requirements, or "should I do A or B" calls,
do **not** guess. Call `aol_ask_observer({ askerId, repoPath, question })`.
It returns immediately with a `ticketId`. The daemon will:

1. DM the observer with your question.
2. At 5 min with no reply, send a follow-up phrase ("u there?").
3. At 8 min total, escalate to another non-away peer in the repo.
4. At 13 min total, give up.

While waiting, **continue working on side tasks** and `aol_check_inbox`
between actions to spot replies.

## Inbox cadence — never miss a DM

After every `claim_file`, every `release_file`, every `mark_completed`, and
at the start of every new sub-task: call `aol_check_inbox({ agentId, since })`.
Pass back the cursor you got last call.

Any AOL response that includes `inbox.unread > 0` means your **next** call
must be `aol_check_inbox`.

Any DM addressed to you must be replied to (even just "ack — looking") before
continuing other work. Observer questions, peer escalations, and check-ins all
land here.

## Stepping away

When wrapping a sub-task, call `aol_set_offline({ agentId })`. This sets you to
`away` (with a 90s-themed away message). After 15 min idle the daemon flips you
to fully `offline`. Both states are revivable — future sub-agents can take you
over via the buddy-reuse flow above.

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
| `aol_find_reusable_agent` | first, before registering — revive an away/offline buddy |
| `aol_suggest_screen_names` | when picking a fresh name |
| `aol_register_agent` | once, at startup (with reused id if applicable) |
| `aol_claim_file` | before any edit |
| `aol_wait_for_release` | when conflict and you still need the file |
| `aol_release_file` | after edit, with summary |
| `aol_post_to_room` | broad coordination, "is anyone else…?" |
| `aol_send_message` | targeted DM to one peer |
| `aol_check_inbox` | between major actions, and whenever inbox.unread > 0 |
| `aol_ask_observer` | when stuck — async question with auto-escalation |
| `aol_get_question` | inspect a question ticket's status / answer |
| `aol_find_observer` | who is the observer in this repo right now |
| `aol_get_messages` | poll for incoming room/DM activity |
| `aol_get_activity` | recent activity log for the repo |
| `aol_list_claims` | who's holding what right now |
| `aol_inspect_claim` | rationale for a specific claim |
| `aol_mark_started` / `_completed` / `_abandoned` | lifecycle announcements |
| `aol_set_offline` | step away (becomes offline after 15 min idle) |

The point is *predictable parallel work*: fewer overlapping edits, fewer redundant
changes, fewer conflicts from invisible overlap. Use the tools.
