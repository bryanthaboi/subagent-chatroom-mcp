# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo currently is

A **single-page UI prototype** of "AOL — Agents On Line", styled as a late-90s desktop messenger. It is the visual / interaction mock for an MCP server that coordinates parallel sub-agents (file-claim tracking, DMs, chatroom, activity log).

The MCP server itself does **not exist yet** — the README describes the *intended* tool surface (`register agent`, `claim/release file`, `message`, etc.) and a planned `aol-install-skills` CLI, but no server code, package manifest, build step, or test suite is checked in. The "About" panel even says the MCP is *pretend-running* on `:7331`. When asked to implement MCP tools, treat the README as a spec, not as documentation of existing code.

## Running it

There is no build, no `npm install`, no tests. To use the UI, open `Agents Online.html` in a browser. JSX is transformed in-browser by `@babel/standalone`, so editing a `.jsx` file just needs a reload — no bundler.

If `file://` blocks something (e.g. font/image loads), serve the directory:

```bash
python3 -m http.server 3312
# then open http://localhost:3312/Agents%20Online.html
```

The README mentions port 3312 as the intended UI port, but nothing in the code binds to it — it's just a convention for the static server.

## Architecture

Three JSX files are loaded in order by `Agents Online.html` and communicate **only through globals on `window`**. There are no ES module imports.

1. `aol-core.jsx` — exports `window.AOL_DATA` containing:
   - `AGENTS`, `YOU` — the cast of fake agents
   - `INITIAL_STATES` — starting lifecycle state per agent (`editing` / `reviewing` / `waiting` / `idle` / `complete` / `offline`) plus `file` and `reason`
   - `ROOM_SCRIPT`, `DM_SCRIPTS` — canned message timelines that play back over time
   - `AudioFx` — synthesized retro chimes (no sampled audio); `signon`, `knock`, `msg`, `workStart`, `workDone`, etc.
   - `Win` — generic draggable/resizable window component
   - `Icon` — inline-SVG pixel icons
2. `aol-windows.jsx` — exports `window.AOL_WINDOWS` (`BuddyList`, `ChatRoom`, `DMWindow`, `FileTargets`, `ActivityLog`, `About`). Depends on `AOL_DATA`.
3. `aol-app.jsx` — top-level `App` + `SignOn`, mounts via `ReactDOM.createRoot`. Owns all state (window z-order, open DMs, chat log, agent states, activity events) and orchestrates the demo via two `useEffect` loops:
   - **Chatter loop** — walks `ROOM_SCRIPT` with randomized delays, scaled by `chatterSpeed`.
   - **Lifecycle transitions** — a fixed `transitions` array of `[delayMs, fn]` pairs that flip agent statuses to fake completions, claim handoffs, and the README's "review-before-rework" example (`pixel_pat` → `dashboard_dee` drops her edit).

If you add a new shared helper, attach it to `window.AOL_DATA` (or a new namespace) — anything else won't be visible across files.

## Demo is scripted, not reactive

Everything you see in motion is hardcoded: the room transcript, IM replies, and the agent lifecycle. There is no real backend, no event bus, no polling. When changing demo behavior, edit:

- `ROOM_SCRIPT` / `DM_SCRIPTS` in `aol-core.jsx` for canned text
- the `transitions` array in `aol-app.jsx` (`React.useEffect` keyed on `signedOn`, ~line 222) for lifecycle changes
- `INITIAL_STATES` in `aol-core.jsx` for the starting tableau

A generic IM reply ladder (`['ack 👍', 'noted, ty', ...]`) kicks in once a `DM_SCRIPTS[agentId]` script is exhausted — that's why typing into a DM always gets *something* back.

## Inter-agent communication norms (from README)

If/when you build the MCP layer, the README's coordination rules are load-bearing product requirements, not stylistic preferences:

- **Short messages**, no fenced code blocks between agents, no copied diffs — describe intent in prose.
- Agents declare **file intent + rationale** before edits; peers can wait, then re-read after a claim clears and *drop* their edit if it's already covered.
- A parent agent should be able to **check in** on a sub-agent that claimed a file and went quiet.

The UI surfaces these via the File Targets table (holder + status pill + reason + "waiting on…") and the Activity Log's `claim` / `release` / `online` / `msg` event kinds. Keep new tools/UI consistent with that vocabulary.
