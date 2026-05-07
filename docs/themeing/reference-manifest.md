# `theme.json` reference

Every theme's `theme.json` is parsed against the schema in `src/daemon/themes.ts`. This page documents every field plus the daemon's validation rules.

## Schema

```jsonc
{
  "name": "aol",                     // required, string. Must match the directory name. Unique across (bundled, external).
  "displayName": "AOL Classic",      // required, string. What appears in the Settings picker.
  "version": "1.0.0",                // required, string. Free-form; semver suggested.
  "author": "bryanthaboi",           // optional, string.
  "description": "...",              // optional, string.

  "extends": null,                   // required, string | null. One-level only — must point at a theme whose own `extends` is null.
  "layout": "multiwindow",           // required, "multiwindow" | "singlewindow". Informational hint; truth is what Shell.jsx actually does.

  "css": "theme.css",                // required, string. Path relative to the theme dir; the file must exist.
  "shell": "Shell.jsx",              // optional, string. Path relative to the theme dir; if present, the file must exist.
                                     //   If omitted and `extends` is set, the base's shell is reused.
                                     //   If omitted and no extends, the FallbackShell is used.
  "assets": "assets/",               // optional, string. Just a hint; the daemon doesn't enforce structure.

  "audio": {                         // optional. Sound-pack overrides; merged into the bundled-aol defaults.
    "signon":  "assets/dooropen.wav",
    "signoff": "assets/doorslam.wav",
    "imRecv":  "assets/imrcv.wav",
    "imSend":  "assets/imsend.wav",
    "welcome": "assets/welcome.wav"
  },

  "compatVersion": 1                 // required, integer. Must match THEME_COMPAT_VERSION (see src/shared/types.ts).
}
```

## Validation rules

A theme is valid only if all of these hold; otherwise it appears in the Settings picker as disabled with `invalidReason`:

1. `theme.json` parses as JSON and matches the schema (zod).
2. `name` matches the directory name on disk.
3. `name` is unique across (bundled, external). On collision, **bundled wins**; the external one is invalid with reason `"name collision with bundled theme"`.
4. `css` resolves to a file that exists.
5. If `shell` is set, it resolves to a file that exists.
6. If `extends` is set, the named theme exists, is itself valid, and has `extends: null` (no chains).
7. `compatVersion` equals the daemon's `THEME_COMPAT_VERSION`.

## Examples

### Minimal valid manifest

```json
{
  "name": "minty",
  "displayName": "Minty",
  "version": "0.1.0",
  "extends": null,
  "layout": "multiwindow",
  "css": "theme.css",
  "compatVersion": 1
}
```

(No shell, no audio, no assets. The default behavior is to use the FallbackShell since `extends` is null and no `shell` is provided. Most themes you write should ship a shell or `extends: "aol"`.)

### Extending the AOL theme

```json
{
  "name": "pinkaol",
  "displayName": "Pink AOL",
  "version": "0.1.0",
  "extends": "aol",
  "layout": "multiwindow",
  "css": "theme.css",
  "compatVersion": 1
}
```

CSS load order at boot: `retro.css` → `themes/bundled/aol/theme.css` → `themes/.../pinkaol/theme.css`. AOL's `Shell.jsx` is reused (no `shell` in the extending manifest).

### Invalid: name/dir mismatch

The directory is `myskin/` but the manifest says:

```json
{ "name": "yourskin", "displayName": "...", "version": "0.1.0", "extends": null, "layout": "multiwindow", "css": "theme.css", "compatVersion": 1 }
```

Daemon `invalidReason`: `manifest name (yourskin) does not match dir name (myskin)`.

### Invalid: chained extends

A → extends B → extends C is rejected at the leaf:

```json
{ "name": "c", "extends": "b", ... }
```

If `b` itself extends another theme, daemon `invalidReason`: `extends "b" forms a chain (extends must be one level deep)`.

### Invalid: broken extends

```json
{ "name": "lonely", "extends": "ghost", ... }
```

If `ghost` doesn't exist (or is itself invalid), daemon `invalidReason`: `extends "ghost" but it is not a valid theme`.
