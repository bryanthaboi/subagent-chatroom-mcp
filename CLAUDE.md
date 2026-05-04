# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

The **AOL — Agents On Line** MCP server, daemon, and retro web UI. Agents
register with a `repoPath`, get grouped into a folder per repo in the buddy
list, and coordinate via per-repo chat rooms, DMs, and file claims.

The daemon is implemented in TypeScript and listens on port **3312** for both
the UI (static + SSE) and the REST API. The MCP server is a thin stdio shim
that forwards tool calls to the daemon over HTTP and auto-spawns the daemon if
it's not already running.

> Earlier revisions of this repo were a single-page UI mockup with a scripted
> demo. That mockup is now wired to the real backend; the scripts and fake
> agents are gone. The UI files in `public/` are still JSX transformed in the
> browser by `@babel/standalone` — no bundler.

## Layout

```
src/
  daemon/         # HTTP server, state, SSE, REST routes
  mcp/            # @modelcontextprotocol/sdk stdio server (tool surface)
  cli/            # `aol` CLI: start/stop/status/install-skills/agent
  shared/         # types + AolClient (HTTP client used by both MCP and CLI)
public/           # served at :3312 — index.html + 3 .jsx files + retro.css + logo
skills/           # `aol-coordination/SKILL.md` — installable into agent skill dirs
service/          # macOS launchd plist template
scripts/          # install-service.sh / uninstall-service.sh
tests/            # vitest — state + server integration tests
```

## Running it

```bash
pnpm install
pnpm build          # tsc → dist/
pnpm start          # detached daemon on 127.0.0.1:3312, pid → ~/.aol/daemon.pid
pnpm status
pnpm stop
pnpm kill
pnpm restart
pnpm test
```

For local UI dev: `pnpm dev` runs the daemon via `tsx` in the foreground; edit
`public/*.jsx` and reload the browser.

For service-on-login (macOS): `pnpm run service:install` /
`pnpm run service:uninstall`. Full instructions in [DEPLOY.md](./DEPLOY.md).

## Architecture rules

- **State lives in the daemon.** MCP processes and the UI are clients.
- **Agents are scoped by `repoPath`.** Buddy list folders, chat rooms, file
  claims, and activity logs are keyed on this. When adding a new feature,
  default to per-repo scoping.
- **MCP and CLI both go through `AolClient`** in `src/shared/client.ts`. Don't
  duplicate fetch logic.
- **The MCP server should remain thin.** Business logic belongs in
  `src/daemon/state.ts`. The MCP layer just translates schemas to HTTP.
- **The UI talks to the daemon over fetch + SSE only.** No direct globals
  injected from the server side; everything React reads comes from
  `AolNet.subscribe()` events or initial REST loads.

## Inter-agent communication norms (load-bearing)

These are product requirements, not stylistic preferences:

- **Short messages**, no fenced code blocks between agents, no copied diffs.
  The state store warns on `\`\`\`` fences and over-long bodies — keep that
  behavior; it's how the rule gets enforced softly.
- Agents declare **file intent + reason** before edits via `aol_claim_file`.
- Peers can wait via `aol_wait_for_release`, then re-read after release and
  *drop* their edit if it's already covered.
- A parent agent should be able to **DM-check-in** on a sub-agent that claimed
  a file and went quiet.

The UI surfaces these via the File Targets table (holder + mode + reason +
waiter count) and the Activity Log's `claim` / `release` / `online` / `msg` /
`dm` event kinds. New tools/UI must use the same vocabulary.

## When extending

- New MCP tool: add a route in `src/daemon/routes.ts`, a method on
  `AolClient`, and a `registerTool` call in `src/mcp/index.ts`. Keep tool
  descriptions reminding the model of the coordination rules.
- New event: extend `BroadcastEvent` in `src/shared/types.ts`, publish it from
  the relevant route, and wire it in `aol-app.jsx`'s SSE handler.
- New UI window: append to `aol-windows.jsx`, register it in the App's
  `windows` state in `aol-app.jsx`, hook up an icon in `Icon` (in
  `aol-core.jsx`).
