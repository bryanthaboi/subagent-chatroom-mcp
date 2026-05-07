# JS API reference

Everything a theme is allowed to reach for at runtime, organized by global namespace.

## `window.AOL_DATA`

Set by `aol-core.jsx` before the app boots. Contains:

| Member | Stable? | Purpose |
|---|---|---|
| `Win` | stable | Draggable window chrome React component (used by multi-window shells) |
| `Icon` | stable | `{ buddies, chat, files, folder, log, dm, about }` — small SVG icons |
| `AudioFx` | stable | sound effects (see below) |
| `AolNet` | stable | HTTP+SSE client (see below) |
| `STATUS_COLORS` | stable | `{ online, idle, editing, ... }` color map for status dots |
| `colorForName(name)` | stable | deterministic hash → palette color |
| `avatarLetter(name)` | stable | first uppercase letter for avatar tiles |
| `basename(p)` | stable | last path segment (or `'global'` for `__global__`) |
| `tsHM(ms)` | stable | `HH:MM` |
| `tsHMS(ms)` | stable | `HH:MM:SS` |
| `relTime(ms)` | stable | `'just now'`, `'5m ago'`, `'2h ago'`, etc. |
| `devlog(category, ...args)` | stable | gated console.log (see below) |

### `AudioFx`

| Method | Purpose |
|---|---|
| `setEnabled(bool)` | global mute |
| `isEnabled()` | current mute state |
| `setAudioMap({signon, signoff, welcome, imRecv, imSend})` | runtime sample-path swap; called by `theme-loader.jsx` |
| `signon()`, `signoff()`, `welcome()`, `imRecv()`, `imSend()` | sampled cues (use the active map) |
| `knock()`, `workStart()`, `workDone()`, `waitResolved()`, `error()` | synthesized chimes (oscillator-based, no sample) |

### `AolNet`

Promise-returning HTTP wrappers. Same-origin fetch + SSE.

| Method | Endpoint |
|---|---|
| `listRepos()` | `GET /api/repos` |
| `listAgents(repoPath?)` | `GET /api/agents` |
| `listClaims(repoPath?, activeOnly?)` | `GET /api/claims` |
| `getMessages({repoPath, since, peer, agentId})` | `GET /api/messages` |
| `getActivity({repoPath, since, limit})` | `GET /api/activity` |
| `sendMessage(input)` | `POST /api/messages` |
| `releaseClaim(id, summary)` | `POST /api/claims/:id/release` |
| `setOffline(id, awayMessage?)` | `POST /api/agents/:id/offline` |
| `registerObserver({name, repoPath, role})` | `POST /api/agents` |
| `deleteAgent(id)` | `DELETE /api/agents/:id` |
| `hideRepo(path)` | `POST /api/repos/hide` |
| `heartbeat(id)` | `POST /api/agents/:id/heartbeat` |
| `beaconOffline(id)` | `navigator.sendBeacon` to /offline |
| `subscribe(repoPath?, onEvent)` | SSE subscription, returns unsubscribe |
| `getSettings()` | `GET /api/settings` |
| `setSettings(patch)` | `POST /api/settings` |
| `listThemes()` | `GET /api/themes` |
| `getResolvedTheme(name)` | `GET /api/themes/:name/resolved` |

### `devlog`

```jsx
window.AOL_DATA.devlog('theme', 'loaded', resolved.active.name);
// → console: [theme] loaded aol
```

Cheap when off; safe to scatter. Toggle with the `debug.devlog` setting.

## `window.AOL_WINDOWS`

Set by `aol-windows.jsx`. The stock components every theme composes:

| Component | Notes |
|---|---|
| `BuddyList` | per-repo folder list; expand/collapse, double-click row to IM |
| `ChatRoom` | per-repo chat with message log + send box |
| `DMWindow` | 1-on-1 IM thread |
| `FileTargets` | active claims table (file, holder, mode, reason, waiters) |
| `ActivityLog` | live event stream (online/offline/claim/release/msg/dm) |
| `About` | About window content |
| `Settings` | settings panel: theme picker + external dir + audio + devlog |

## `window.AOL_SIGNON`

Set by `aol-signon.jsx`. Exports `SignOn` — the pre-app sign-on screen. Currently not theme-overridable.

## `window.AOL_THEME_SHELL`

Set by the active theme's `Shell.jsx`. Read once by `aol-app.jsx` after `__AOL_BOOT_READY` resolves.

## `window.AOL_FALLBACK_SHELL`

Set by `fallback-shell.jsx`. Used when `AOL_THEME_SHELL` is missing or the active theme failed to resolve.

## `window.AOL_RESOLVED_THEME`

The boot payload from `/api/themes/<active>/resolved`. Themes can read for diagnostics; do **not** mutate.

```js
window.AOL_RESOLVED_THEME.active.name      // 'aol'
window.AOL_RESOLVED_THEME.active.cssUrls   // ['/themes/bundled/aol/theme.css']
window.AOL_RESOLVED_THEME.active.shellUrl  // '/themes/bundled/aol/Shell.jsx'
window.AOL_RESOLVED_THEME.base             // null or { name, source }
```

## `window.AOL_DEBUG`

`{ enabled: boolean }`. Drives `devlog`. The boot loader and the controller both write to it from `settings['debug.devlog']`. You can also flip it manually from the console:

```js
window.AOL_DEBUG.enabled = true;
```

## Settings keys (also at `/api/settings`)

| Key | Default | Effect |
|---|---|---|
| `theme.active` | `"aol"` | which theme is active. Changing this reloads the page. |
| `theme.externalDir` | `null` | path to external themes folder, or null. |
| `audio.enabled` | `true` | `AudioFx.setEnabled(...)` is wired to this live. |
| `debug.devlog` | `false` | `window.AOL_DEBUG.enabled` is wired to this live. |
