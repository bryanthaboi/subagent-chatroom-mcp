# Recipes

Concrete patterns for common theme tasks.

## 1. Pink AOL — extending a base theme

Folder layout:

```
public/themes/pinkaol/
  theme.json
  theme.css
```

`theme.json`:

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

`theme.css` (pinkaol owns nothing else; it just overrides AOL's variables):

```css
:root {
  --aol-yellow: #ffd0e0;
  --aol-yellow-deep: #f55a98;
  --title: #6e1844;
  --aim-highlight: #fff0f7;
}
```

Boot order with this active: `retro.css` → `themes/bundled/aol/theme.css` → `themes/bundled/pinkaol/theme.css`. AOL's `Shell.jsx` is reused (no `shell` field in the manifest).

## 2. Sound pack — replacing chimes only

```
public/themes/aim95/
  theme.json
  theme.css            (a single line is fine: /* uses base theme */)
  assets/
    knock.wav
    bye.wav
```

`theme.json`:

```json
{
  "name": "aim95",
  "displayName": "AIM 95 (sound pack)",
  "version": "0.1.0",
  "extends": "aol",
  "layout": "multiwindow",
  "css": "theme.css",
  "audio": {
    "imRecv":  "assets/knock.wav",
    "signoff": "assets/bye.wav"
  },
  "compatVersion": 1
}
```

Anything not listed in `audio` falls back to the bundled aol sample for that key.

## 3. Single-window from scratch

A Slack/Discord-style theme: BuddyList in a fixed sidebar, one ChatRoom in the main pane at a time. No draggable windows.

```
public/themes/slacky/
  theme.json
  theme.css
  Shell.jsx
```

`theme.json`:

```json
{
  "name": "slacky",
  "displayName": "Slacky",
  "version": "0.1.0",
  "extends": null,
  "layout": "singlewindow",
  "css": "theme.css",
  "shell": "Shell.jsx",
  "compatVersion": 1
}
```

`Shell.jsx` (the load-bearing piece):

```jsx
const { devlog } = window.AOL_DATA;
const { BuddyList, ChatRoom } = window.AOL_WINDOWS;

function Shell(props) {
  const [activeRepo, setActiveRepo] = React.useState(props.repos[0]?.repoPath ?? null);
  devlog('shell', 'render', { activeRepo });

  return (
    <div style={{ display: 'flex', height: '100vh', background: '#fff' }}>
      <aside style={{ width: 260, borderRight: '1px solid #333', overflow: 'auto' }}>
        <BuddyList
          repos={props.repos}
          agentsByRepo={props.agentsByRepo}
          observerName={props.observer.name}
          onOpenChatForRepo={(p) => { setActiveRepo(p); props.openChatForRepo(p); }}
          onOpenDM={props.loadDM}
          onOpenChatPicker={() => {}}
          onOpenFiles={() => {}}
          onOpenLog={() => {}}
          onOpenAbout={() => {}}
          onDelete={props.deleteAgent}
          onHideRepo={props.hideRepo}
        />
      </aside>
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {activeRepo ? (
          <ChatRoom
            repo={props.repos.find((r) => r.repoPath === activeRepo)}
            messages={props.messagesByRepo[activeRepo] || []}
            agentCount={(props.agentsByRepo[activeRepo] || []).length}
            onSend={(body) => props.sendRoom(activeRepo, body)}
            observerName={props.observer.name}
            observerId={props.observer.id}
            repoPath={activeRepo}
          />
        ) : (
          <div style={{ padding: 24 }}>Pick a repo on the left.</div>
        )}
      </main>
    </div>
  );
}

window.AOL_THEME_SHELL = Shell;
```

`theme.css` defines the modern flat look (no gray bevels):

```css
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
.buddy-list { background: #f7f7fa; padding: 8px 0; }
.buddy-row { padding: 6px 12px; }
.buddy-row:hover { background: #ebedf3; }
.chat-toolbar { background: #fff; border-bottom: 1px solid #e0e0e6; padding: 12px; }
.chat-log { background: #fff; padding: 16px; }
.chat-input-area { border-top: 1px solid #e0e0e6; padding: 12px; }
.chat-input { border: 1px solid #e0e0e6; border-radius: 6px; padding: 8px; }
.btn { background: #5865f2; color: #fff; border: none; border-radius: 4px; }
```

The Shell ignores `props.windows`, `chatWindows`, `dmWindows`, `openWin`, `Win` entirely. DMs are not handled in this skeleton — add a panel for `props.dms`/`props.dmWindows` if you want them, or use `loadDM(agent)` from a context menu.
