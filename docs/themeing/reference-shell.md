# `Shell.jsx` contract

The Shell is the *active* part of a theme — a React component that decides the top-level layout. The inner panels (BuddyList, ChatRoom, DMWindow, FileTargets, ActivityLog, About, Settings) are stock and shared across all themes.

## Globals available

```jsx
const { Win, Icon, AudioFx, AolNet, devlog, colorForName, avatarLetter, basename, tsHM, tsHMS, relTime, STATUS_COLORS } = window.AOL_DATA;
const { BuddyList, ChatRoom, DMWindow, FileTargets, ActivityLog, About, Settings } = window.AOL_WINDOWS;
```

See [reference-api.md](reference-api.md) for the full list. `Win` is the optional draggable window chrome — single-window themes don't have to use it.

## Setting your shell

The last line of your file:

```jsx
window.AOL_THEME_SHELL = Shell;
```

That's how `aol-app.jsx` finds your component.

## Controller props (the "ShellProps" surface)

The controller in `aol-app.jsx` builds and passes a single props object. **The Shell talks to the rest of the app only through these props.** Anything else is private and may change without a `compatVersion` bump.

```ts
type ShellProps = {
  // identity
  observer: { id?: string; name: string };

  // server-sourced state (already filtered/derived)
  repos:           Repo[];
  agentsByRepo:    Record<string, Agent[]>;       // observers excluded
  claims:          Claim[];
  activity:        ActivityEvent[];
  messagesByRepo:  Record<string, Message[]>;
  dms:             Record<string, Message[]>;
  settings:        Settings;
  themes:          DiscoveredTheme[];

  // actions
  sendRoom:        (repoPath: string, body: string) => Promise<void>;
  sendDM:          (agentId: string, body: string) => Promise<void>;
  openChatForRepo: (repoPath: string) => Promise<void>; // hydrates messages
  loadDM:          (agent: Agent) => Promise<void>;     // hydrates DM scrollback + opens window
  forceRelease:    (claim: Claim) => Promise<void>;
  deleteAgent:     (agent: Agent) => Promise<void>;
  hideRepo:        (repo: Repo) => Promise<void>;
  setSettings:     (patch: Partial<Settings>) => Promise<void>;

  // window-manager helpers — useful for multi-window shells; ignored by single-window
  windows:     WindowState;                  // { buddies, files, log, about, settings }
  chatWindows: Record<string, WindowState>;  // keyed by repoPath
  dmWindows:   Record<string, WindowState>;  // keyed by agentId
  openWin:     (key: string) => void;        // 'buddies' | 'files' | 'log' | 'about' | 'settings'
  closeWin:    (key: string) => void;
  activateWin: (key: string) => void;
  closeChat:   (repoPath: string) => void;
  closeDM:     (agentId: string) => void;
  activeWin:   string;

  // scope state (multi-window: which repo are we viewing?)
  filesScope:    'all' | string;
  setFilesScope: (s: 'all' | string) => void;
  logScope:      'all' | string;
  setLogScope:   (s: 'all' | string) => void;

  // banner channel
  errorBanner:  string | null;
  dismissError: () => void;
};
```

## Multi-window pattern

Look at `public/themes/aol/Shell.jsx` for the full reference. Sketch:

```jsx
function Shell(props) {
  const { windows, chatWindows, dmWindows, openWin, activateWin, closeWin, ... } = props;
  return (
    <div className="desktop">
      {windows.buddies.open && (
        <Win id="buddies" {...windows.buddies} active={props.activeWin === 'buddies'}
             onActivate={activateWin} onClose={closeWin}>
          <BuddyList ... />
        </Win>
      )}
      {/* ...one Win per visible window... */}
    </div>
  );
}
```

Use `Win` for chrome, the `windows`/`chatWindows`/`dmWindows` maps to know what's open and where, `openWin`/`closeWin`/`activateWin` to manipulate them.

## Single-window pattern

A single-window theme **ignores** `windows`, `chatWindows`, `dmWindows`, `openWin`, `Win`, etc. It tracks an `activeRepo` (and maybe `activeDmId`) in local state and renders only one `<ChatRoom/>` (or `<DMWindow/>`) at a time. See [recipes.md](recipes.md#single-window-from-scratch) for a 30-line skeleton.

## `compatVersion` evolution policy

The current `compatVersion` is `1` (see `THEME_COMPAT_VERSION` in `src/shared/types.ts`).

- **Adding a new prop** to `ShellProps` → no version bump. Old themes ignore it.
- **Removing or renaming a prop** → bump `compatVersion`. Old themes show invalid in Settings until updated.
- **Changing a prop's shape** → bump `compatVersion`.

Themes pin their compat version in `theme.json`. If the daemon's `THEME_COMPAT_VERSION` is higher than the manifest's, the theme is shown invalid with reason `incompatible theme (compat vN, app vM)`.
