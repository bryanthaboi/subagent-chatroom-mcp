# AOL Theming

User-facing reference for skinning the AOL — Agents On Line UI.

## What a theme is

A theme is a folder with at least:

- `theme.json` — manifest (see [reference-manifest.md](reference-manifest.md))
- `theme.css` — stylesheet

Optionally:

- `Shell.jsx` — top-level layout component (see [reference-shell.md](reference-shell.md))
- `assets/` — images, sounds, fonts

## Where themes live

Two places:

- **Bundled** — `public/themes/<name>/` in this repo. The default `aol` theme lives here.
- **External** — any folder on disk. Point AOL at it in Settings → External themes folder. Each sub-folder containing a valid `theme.json` becomes an installable theme.

If a bundled theme and an external theme share the same name, **bundled wins**. The external one is shown as invalid in Settings with `name collision with bundled theme`.

## Boot flow

1. `index.html` loads React + ReactDOM + `@babel/standalone`.
2. `theme-loader.jsx` reads `/api/settings` to find the active theme name.
3. It calls `/api/themes/<name>/resolved` for the load plan: ordered CSS URLs, shell URL, audio map, manifest.
4. CSS `<link>` tags are injected in cascade order: `retro.css` → base theme css (only if `extends`) → active theme css.
5. `<script type="text/babel" src="<shell url>">` loads the Shell, which sets `window.AOL_THEME_SHELL`.
6. `aol-app.jsx` (the controller) renders `<Shell {...controller}/>`.

If anything fails (theme missing, css 404, shell error), the fallback shell renders a minimal usable UI plus an error banner pointing back at Settings.

## Settings keys

Stored in the daemon at `~/.aol/aol.db` (table `settings`). Read/write at `GET/POST /api/settings`.

| key | type | default |
|---|---|---|
| `theme.active` | string | `"aol"` |
| `theme.externalDir` | string \| null | `null` |
| `audio.enabled` | boolean | `true` |
| `debug.devlog` | boolean | `false` |

Changing `theme.active` reloads the page. Changing `theme.externalDir` re-scans without a reload. Toggling `audio.enabled` and `debug.devlog` is live.

## Where to start

- New to theming? Read [making-a-theme.md](making-a-theme.md).
- Writing a manifest? See [reference-manifest.md](reference-manifest.md).
- Writing a Shell.jsx? See [reference-shell.md](reference-shell.md).
- Targeting CSS? See [reference-css.md](reference-css.md).
- Looking for the JS surface (Win, AolNet, devlog, etc.)? See [reference-api.md](reference-api.md).
- Recipes (extends, single-window, sound packs): [recipes.md](recipes.md).
