# CSS reference

Every CSS variable, class, and id used by the stock components. **Stable** = themes can rely on this name not changing without a `compatVersion` bump. **Internal** = subject to change; don't target it.

## Reset (`public/retro.css`) — always loaded first

| Selector | Stable? | Notes |
|---|---|---|
| `*` | stable | `box-sizing: border-box` |
| `html`, `body` | stable | margin/padding/height reset; base font-size 13px |
| `::-webkit-scrollbar` | stable | width: 16px; theme can replace track/thumb visuals via the same selector |

(That's the entire reset surface. Everything else is theme-owned.)

## Window chrome — rendered by `Win` from `aol-core.jsx`

| Selector | Stable? | Notes |
|---|---|---|
| `.win` | stable | the outer window container |
| `.win.inactive` | stable | added when the window isn't focused |
| `.win-titlebar` | stable | drag handle + title bar |
| `.win-icon` | stable | icon next to the title (16x16) |
| `.win-title-text` | stable | title string |
| `.win-btns` | stable | wrapper around close/minimize buttons |
| `.win-btn` | stable | individual titlebar button |
| `.win-btn:active` | stable | "pressed" state |
| `.win-body` | stable | content area below the titlebar |

## Buddy list — `aol-windows.jsx#BuddyList`

| Selector | Stable? | Notes |
|---|---|---|
| `.buddy-header` | stable | yellow strip with logo + observer name |
| `.buddy-header .small-logo` | stable | the AOL running-man logo |
| `.buddy-header .you` | stable | observer name block |
| `.buddy-tabs`, `.buddy-tab`, `.buddy-tab.active` | stable | the Buddies/Chat/Files/Log tabs |
| `.buddy-list` | stable | scrollable list container |
| `.buddy-group` | stable | per-repo folder header |
| `.buddy-group .caret` | stable | ▼ / ▶ glyph |
| `.buddy-group .count` | stable | "(live/total)" badge |
| `.buddy-row` | stable | one buddy line |
| `.buddy-row:hover`, `.buddy-row.selected` | stable | hover/active states |
| `.buddy-row .dot`, `.dot.online`, `.dot.idle`, `.dot.editing`, `.dot.reviewing`, `.dot.waiting`, `.dot.complete`, `.dot.offline` | stable | status dots |
| `.buddy-row .name` | stable | buddy name span |
| `.buddy-row .away-flag` | stable | small italic away indicator |
| `.buddy-row .badge` | stable | edit/read/wait/done/idle/abandon/away/offline pill |
| `.buddy-footer` | stable | bottom action bar |

## Chat room — `aol-windows.jsx#ChatRoom`

| Selector | Stable? |
|---|---|
| `.chat-toolbar` | stable |
| `.chat-log`, `.chat-log .line`, `.chat-log .who`, `.chat-log .sys`, `.chat-log .ts` | stable |
| `.chat-input-area`, `.chat-format-bar`, `.chat-format-bar .swatch`, `.chat-input`, `.chat-input-row`, `.chat-send` | stable |

## DM window — `aol-windows.jsx#DMWindow`

| Selector | Stable? |
|---|---|
| `.dm-log`, `.dm-log .who-them`, `.dm-log .who-you` | stable |
| `.dm-input` | stable |
| `.dm-window` | stable |

## File targets — `aol-windows.jsx#FileTargets`

| Selector | Stable? |
|---|---|
| `.files-tbl`, `.files-tbl table`, `.files-tbl th`, `.files-tbl td`, `.files-tbl tr:hover td` | stable |
| `.files-tbl .pill`, `.pill.editing`, `.pill.reviewing`, `.pill.waiting`, `.pill.complete`, `.pill.queued` | stable |

## Activity log — `aol-windows.jsx#ActivityLog`

| Selector | Stable? |
|---|---|
| `.log-pane`, `.log-pane .ts`, `.log-pane .who` | stable |
| `.log-pane .ev-online`, `.log-pane .ev-offline`, `.log-pane .ev-claim`, `.log-pane .ev-release`, `.log-pane .ev-msg` | stable |

## Misc

| Selector | Stable? | Notes |
|---|---|---|
| `.desktop` | stable | the wallpaper container that the Shell wraps everything in |
| `.desk-icon`, `.desk-icon:hover`, `.desk-icon img`, `.desk-icon .icon-img` | stable | desktop shortcut tiles |
| `.btn`, `.btn:active`, `.btn.pressed`, `.btn:focus` | stable | themed button |
| `.inset` | stable | inset bevel utility |
| `.taskbar`, `.start-btn`, `.start-btn .start-logo`, `.task-items`, `.task-item`, `.task-item.active`, `.task-item .ti-name`, `.tray` | stable | taskbar (currently unrendered by AOL Shell but selectors reserved) |
| `.tweaks`, `.tweaks-body`, `.tweaks-row` | stable | floating settings panel area |
| `.about-body`, `.about-body h1`, `.about-body code`, `.about-body ul` | stable | About window content |
| `.avatar` | stable | block-letter avatar tile |
| `.hint` | stable | bottom-left help text |
| `.runner-svg`, `.runner-svg.bob`, `.runner` | stable | running-man mascot |
| `.pico` | stable | tiny pixel-style icon utility |

## CSS variables (declared by AOL theme; consumers can rely on them when AOL is in scope, e.g. via `extends: "aol"`)

| Variable | Stable? | Purpose |
|---|---|---|
| `--bg`, `--bg-alt` | stable | desktop wallpaper |
| `--chrome`, `--chrome-hi`, `--chrome-lo`, `--chrome-loer` | stable | gray-bevel chrome family |
| `--face` | stable | window face color |
| `--title`, `--title-text`, `--title-inactive` | stable | titlebar |
| `--aol-blue`, `--aol-yellow`, `--aol-yellow-deep` | stable | brand accents |
| `--link`, `--ok`, `--warn`, `--err` | stable | semantic colors |
| `--pixel`, `--sys`, `--serif` | stable | font families |
| `--aim-font`, `--aim-online`, `--aim-offline`, `--aim-away`, `--aim-highlight`, `--aim-blue`, `--aim-red` | stable | AIM-style content fonts/colors |

## Internal IDs (do not target from theme CSS)

| Selector | Why internal |
|---|---|
| `#root` | React mount point; not part of the theming surface |
