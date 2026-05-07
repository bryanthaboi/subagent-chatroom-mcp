# Making a theme

End-to-end walkthrough.

## 1. Pick a directory

For experimentation, copy the bundled aol theme inside this repo:

```bash
cp -r public/themes/aol public/themes/mytheme
```

For something you maintain privately, put it in your external themes folder:

```bash
cp -r public/themes/aol ~/aol-themes/mytheme
```

(The external dir is whatever you set in Settings → External themes folder. See `setting-up-theme-repo.md` in the repo root for keeping that folder under version control.)

## 2. Edit `theme.json`

Update the fields that matter for your theme:

```json
{
  "name": "mytheme",
  "displayName": "My Theme",
  "version": "0.1.0",
  "description": "...",
  "extends": null,
  "layout": "multiwindow",
  "css": "theme.css",
  "shell": "Shell.jsx",
  "compatVersion": 1
}
```

`name` MUST match the directory name. If you only want to recolor the AOL look, set `"extends": "aol"` and **delete** `Shell.jsx` from your theme dir — the AOL Shell will be reused. If you want a totally different layout, keep `Shell.jsx` and edit it.

## 3. Edit `theme.css`

The simplest theme just overrides CSS variables defined by the base:

```css
:root {
  --aol-blue: #ff00ff;
  --aol-yellow: #ffaaff;
  --bg: #200030;
}
```

For full reference of variables, classes, and ids, see [reference-css.md](reference-css.md).

## 4. (Optional) Replace the Shell

If you `"extends": "aol"` and don't ship a `Shell.jsx`, the AOL Shell handles layout. To go single-window (Slack/Discord style) or rearrange, write your own. Read [reference-shell.md](reference-shell.md) for the controller contract; copy the [single-window pattern in recipes.md](recipes.md) as a starting point. Set `window.AOL_THEME_SHELL = YourShell` at the bottom.

## 5. (Optional) Sound pack

In `theme.json`, add an `audio` map and put your `.wav`s in `assets/`:

```json
"audio": {
  "signon":  "assets/dingdong.wav",
  "signoff": "assets/byebye.wav"
}
```

Any key you omit falls back to the bundled aol sound for that key.

## 6. Make it switchable

Open Settings → Theme → pick your theme → Apply. The page reloads.

If your theme is greyed out, hover the entry to see why. Common reasons:

- `name` in manifest doesn't match dir name
- `theme.css` or referenced `Shell.jsx` doesn't exist
- `extends` points at an unknown or extending theme (chains aren't allowed; one level only)
- `compatVersion` mismatch — check `THEME_COMPAT_VERSION` in `src/shared/types.ts`
