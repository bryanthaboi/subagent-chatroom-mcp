/* global React */
/* Kcals Shell — workspace-style team chat in a draggable+resizable window
   on a dark desktop backdrop. Single shell; the window itself is movable. */

const { devlog, colorForName, avatarLetter, basename, tsHM, tsHMS, relTime } = window.AOL_DATA;
const { Settings: SettingsPanel } = window.AOL_WINDOWS;

const STATUS_DOT = {
  online: 'dt-online', idle: 'dt-idle', editing: 'dt-editing',
  reviewing: 'dt-reviewing', waiting: 'dt-waiting', complete: 'dt-online',
  away: 'dt-away', offline: 'dt-offline', abandoned: 'dt-offline',
};
const STATUS_LABEL = {
  online: 'online', idle: 'idle', editing: 'editing', reviewing: 'reviewing',
  waiting: 'waiting', complete: 'done', away: 'away', offline: 'offline',
  abandoned: 'abandoned',
};

// Sort agents: online first, offline+away last; within each group, agents
// with unread DMs first, then alphabetical.
const ONLINE_STATUSES = new Set(['online', 'idle', 'editing', 'reviewing', 'waiting', 'complete']);
function sortAgents(agents, dmUnread = {}) {
  return [...agents].sort((a, b) => {
    const aOn = ONLINE_STATUSES.has(a.status);
    const bOn = ONLINE_STATUSES.has(b.status);
    if (aOn !== bOn) return aOn ? -1 : 1;
    const aU = (dmUnread[a.id] || 0) > 0 ? 1 : 0;
    const bU = (dmUnread[b.id] || 0) > 0 ? 1 : 0;
    if (aU !== bU) return bU - aU;
    return (a.name || '').localeCompare(b.name || '');
  });
}

function UnreadPill({ n }) {
  return (
    <span style={{
      background: 'var(--kc-red)', color: '#fff',
      fontSize: 11, fontWeight: 700,
      padding: '1px 6px', borderRadius: 10,
      minWidth: 18, textAlign: 'center', lineHeight: 1.4,
      flexShrink: 0,
    }}>{n}</span>
  );
}

function Avatar({ name, color, size = 'md', status }) {
  const px = size === 'lg' ? 36 : size === 'mini' ? 20 : 28;
  const dotCls = status ? STATUS_DOT[status] || 'dt-idle' : null;
  const radius = size === 'lg' ? 6 : 4;
  return (
    <div
      className={size === 'lg' ? 'kc-av-lg' : 'kc-av-mini'}
      style={{
        background: color || colorForName(name || '?'),
        width: px, height: px, borderRadius: radius,
        color: '#fff', fontWeight: 700, fontSize: size === 'mini' ? 11 : 13,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0, position: 'relative',
      }}
    >
      {avatarLetter(name)}
      {dotCls && <span className={`dt ${dotCls}`} style={{
        position: 'absolute', bottom: -2, right: -2,
        width: 9, height: 9, borderRadius: '50%',
        border: '2px solid var(--kc-side-bg)',
      }}></span>}
    </div>
  );
}

// Draggable + resizable window frame
function WindowFrame({ children }) {
  const startW = Math.min(1200, window.innerWidth - 80);
  const startH = Math.min(780, window.innerHeight - 80);
  const [pos, setPos] = React.useState({
    x: Math.max(40, (window.innerWidth - startW) / 2),
    y: Math.max(30, (window.innerHeight - startH) / 2),
  });
  const [size, setSize] = React.useState({ w: startW, h: startH });
  const drag = React.useRef(null);
  const resz = React.useRef(null);

  React.useEffect(() => {
    const move = (e) => {
      if (drag.current) {
        setPos({
          x: Math.max(0, Math.min(window.innerWidth - 80, e.clientX - drag.current.dx)),
          y: Math.max(0, Math.min(window.innerHeight - 40, e.clientY - drag.current.dy)),
        });
      } else if (resz.current) {
        setSize({
          w: Math.max(720, e.clientX - resz.current.x),
          h: Math.max(460, e.clientY - resz.current.y),
        });
      }
    };
    const up = () => { drag.current = null; resz.current = null; };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
  }, []);

  return (
    <div className="kc-frame" style={{ left: pos.x, top: pos.y, width: size.w, height: size.h }}>
      <div
        className="kc-titlebar"
        onMouseDown={(e) => {
          if (e.target.closest('.kc-titlebar-search') || e.target.closest('button') || e.target.closest('.kc-tl-dot')) return;
          drag.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y };
        }}
      >
        <div className="kc-tl">
          <div className="kc-tl-dot close"></div>
          <div className="kc-tl-dot min"></div>
          <div className="kc-tl-dot zoom"></div>
        </div>
        <div className="kc-titlebar-search">
          <span style={{ fontSize: 12 }}>🔍</span>
          <span>Search Agents Online</span>
        </div>
        <div className="kc-titlebar-right">
          <span style={{ fontSize: 12 }}>kcals</span>
        </div>
      </div>
      <div className="kc-body">{children}</div>
      <div
        className="kc-resize-handle"
        onMouseDown={(e) => {
          e.preventDefault();
          resz.current = { x: pos.x, y: pos.y };
        }}
      />
    </div>
  );
}

function Shell(props) {
  const {
    observer, repos, agentsByRepo, claims, activity, messagesByRepo, dms,
    settings, themes,
    sendRoom, sendDM, openChatForRepo, loadDM, hideRepo,
    setSettings,
    errorBanner, dismissError,
  } = props;

  // Active selection: a repoPath, '__activity', '__claims', '__settings', '__friends', or 'dm:<agentId>'
  const [activeRaw, setActiveRaw] = React.useState(() => repos[0]?.repoPath ?? '__friends');
  // Rail section ('home', 'dms', 'activity', 'files', 'settings').
  const [section, setSection] = React.useState('home');
  const [repoMenu, setRepoMenu] = React.useState(null); // { x, y, repo } | null
  const [repoUnread, setRepoUnread] = React.useState({});
  const [dmUnread, setDmUnread] = React.useState({});

  const active = activeRaw;
  const setActive = React.useCallback((next) => {
    setActiveRaw(next);
    if (next.startsWith('dm:')) {
      setDmUnread((u) => ({ ...u, [next.slice(3)]: 0 }));
    } else if (!next.startsWith('__')) {
      setRepoUnread((u) => ({ ...u, [next]: 0 }));
    }
  }, []);

  // New-message tracking: bump unread when active doesn't match the target.
  // First effect run snapshots existing list lengths so pre-mount scrollback
  // isn't counted as new; any key that appears LATER counts from 0.
  const observerIds = React.useMemo(() => new Set([observer.id].filter(Boolean)), [observer.id]);
  const prevRepoLensRef = React.useRef({});
  const prevDmLensRef = React.useRef({});
  const repoSeededRef = React.useRef(false);
  const dmSeededRef = React.useRef(false);

  React.useEffect(() => {
    if (!repoSeededRef.current) {
      for (const [repoPath, list] of Object.entries(messagesByRepo)) {
        prevRepoLensRef.current[repoPath] = list.length;
      }
      repoSeededRef.current = true;
      return;
    }
    for (const [repoPath, list] of Object.entries(messagesByRepo)) {
      const prev = prevRepoLensRef.current[repoPath] ?? 0;
      if (list.length > prev) {
        const fresh = list.slice(prev);
        const inbound = fresh.filter((m) => !observerIds.has(m.from)).length;
        if (inbound > 0 && active !== repoPath) {
          devlog('unread', 'repo +', inbound, repoPath);
          setRepoUnread((u) => ({ ...u, [repoPath]: (u[repoPath] || 0) + inbound }));
        }
      }
      prevRepoLensRef.current[repoPath] = list.length;
    }
  }, [messagesByRepo, active, observerIds]);

  React.useEffect(() => {
    if (!dmSeededRef.current) {
      for (const [peerId, list] of Object.entries(dms)) {
        prevDmLensRef.current[peerId] = list.length;
      }
      dmSeededRef.current = true;
      return;
    }
    for (const [peerId, list] of Object.entries(dms)) {
      const prev = prevDmLensRef.current[peerId] ?? 0;
      if (list.length > prev) {
        const fresh = list.slice(prev);
        const inbound = fresh.filter((m) => !observerIds.has(m.from)).length;
        if (inbound > 0 && active !== 'dm:' + peerId) {
          devlog('unread', 'dm +', inbound, peerId);
          setDmUnread((u) => ({ ...u, [peerId]: (u[peerId] || 0) + inbound }));
        }
      }
      prevDmLensRef.current[peerId] = list.length;
    }
  }, [dms, active, observerIds]);

  React.useEffect(() => {
    if (!repoMenu) return;
    const close = () => setRepoMenu(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [repoMenu]);

  const totalDmUnread = React.useMemo(
    () => Object.values(dmUnread).reduce((a, b) => a + b, 0),
    [dmUnread]
  );
  const totalRepoUnread = React.useMemo(
    () => Object.values(repoUnread).reduce((a, b) => a + b, 0),
    [repoUnread]
  );

  React.useEffect(() => {
    if (active.startsWith('__')) return;
    if (active.startsWith('dm:')) {
      const agentId = active.slice(3);
      const agent = Object.values(agentsByRepo).flat().find((a) => a.id === agentId);
      if (agent) loadDM(agent);
      return;
    }
    openChatForRepo(active);
  }, [active]);

  React.useEffect(() => {
    if (active === '__friends' && repos.length > 0) setActive(repos[0].repoPath);
  }, [repos.length]);

  devlog('shell', 'kcals render', { active, section, repos: repos.length });

  const allAgents = Object.values(agentsByRepo).flat();
  const byId = React.useMemo(() => {
    const m = {};
    for (const a of allAgents) m[a.id] = a;
    return m;
  }, [allAgents]);

  const repoMeta = repos.find((r) => r.repoPath === active) || null;
  const dmAgent = active.startsWith('dm:') ? byId[active.slice(3)] : null;

  const sendActive = (text) => {
    if (active.startsWith('__') || !text.trim()) return;
    if (active.startsWith('dm:')) sendDM(active.slice(3), text);
    else sendRoom(active, text);
  };

  return (
    <>
      <div className="kc-desktop"></div>
      <WindowFrame>
        <NavRail
          section={section}
          onSection={(s) => {
            setSection(s);
            if (s === 'activity') setActive('__activity');
            else if (s === 'files') setActive('__claims');
            else if (s === 'settings') setActive('__settings');
            else if (s === 'home') setActive(repos[0]?.repoPath || '__friends');
            else if (s === 'dms') setActive('__friends');
          }}
          observer={observer}
          totalDmUnread={totalDmUnread}
          totalRepoUnread={totalRepoUnread}
        />
        <Sidebar
          active={active}
          onPick={setActive}
          repos={repos}
          agentsByRepo={agentsByRepo}
          repoUnread={repoUnread}
          dmUnread={dmUnread}
          onRepoContextMenu={(e, repo) => {
            e.preventDefault();
            setRepoMenu({ x: e.clientX, y: e.clientY, repo });
          }}
        />
        <Main
          active={active}
          repoMeta={repoMeta}
          dmAgent={dmAgent}
          messages={repoMeta ? (messagesByRepo[active] || []) : []}
          dmLog={dmAgent ? (dms[dmAgent.id] || []) : []}
          byId={byId}
          sendActive={sendActive}
          observer={observer}
          allAgents={allAgents}
          activity={activity}
          claims={claims}
          settings={settings}
          themes={themes}
          dmUnread={dmUnread}
          onChangeSettings={setSettings}
          onOpenDM={(agent) => setActive('dm:' + agent.id)}
        />
      </WindowFrame>
      {repoMenu && (
        <RepoContextMenu
          x={repoMenu.x}
          y={repoMenu.y}
          repo={repoMenu.repo}
          agents={agentsByRepo[repoMenu.repo.repoPath] || []}
          onOpenChat={() => { setActive(repoMenu.repo.repoPath); setRepoMenu(null); }}
          onHide={() => { hideRepo(repoMenu.repo); setRepoMenu(null); }}
        />
      )}
      {errorBanner && (
        <div className="kc-error-banner" onClick={dismissError}>
          {errorBanner} (click to dismiss)
        </div>
      )}
    </>
  );
}

function RepoContextMenu({ x, y, repo, agents, onOpenChat, onHide }) {
  const canHide = agents.length === 0 || agents.every((a) => a.status === 'offline');
  return (
    <div
      style={{
        position: 'fixed', left: x, top: y, zIndex: 99999,
        background: 'var(--kc-side-bg)',
        border: '1px solid var(--kc-line)',
        boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
        borderRadius: 6,
        padding: 4, minWidth: 180,
        color: 'var(--kc-text)',
        fontSize: 13,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div
        style={{ padding: '6px 10px', cursor: 'pointer', borderRadius: 3 }}
        onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--kc-hover)')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
        onClick={onOpenChat}
      >Open chat</div>
      <div
        style={{
          padding: '6px 10px',
          cursor: canHide ? 'pointer' : 'not-allowed',
          color: canHide ? 'var(--kc-red)' : 'var(--kc-text-mute)',
          borderRadius: 3,
        }}
        title={canHide ? '' : 'all agents in this repo must be offline first'}
        onMouseEnter={(e) => { if (canHide) e.currentTarget.style.background = 'var(--kc-hover)'; }}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
        onClick={() => { if (canHide) onHide(); }}
      >Hide repo{canHide ? '' : ' (agents online)'}</div>
    </div>
  );
}

function NavRail({ section, onSection, observer, totalDmUnread = 0, totalRepoUnread = 0 }) {
  const items = [
    { id: 'home', label: 'Home', icon: '⌂', badge: totalRepoUnread },
    { id: 'dms', label: 'DMs', icon: '✉', badge: totalDmUnread },
    { id: 'activity', label: 'Activity', icon: '🔔', badge: 0 },
    { id: 'files', label: 'Files', icon: '📁', badge: 0 },
    { id: 'settings', label: 'Settings', icon: '⚙', badge: 0 },
  ];
  return (
    <div className="kc-rail">
      <div className="kc-workspace-icon" title="Agents Online">AO</div>
      {items.map((i) => (
        <button key={i.id}
                className={`kc-nav-item ${section === i.id ? 'active' : ''}`}
                onClick={() => onSection(i.id)}>
          <div className="kc-nav-icon">{i.icon}</div>
          <div className="kc-nav-label">{i.label}</div>
          {i.badge > 0 && (
            <span style={{
              position: 'absolute', top: 2, right: 8,
              background: 'var(--kc-red)', color: '#fff',
              fontSize: 10, fontWeight: 700,
              padding: '1px 5px', borderRadius: 8,
              minWidth: 16, textAlign: 'center',
              border: '2px solid var(--kc-rail-bg)',
            }}>{i.badge}</span>
          )}
        </button>
      ))}
      <div className="kc-nav-spacer"></div>
      <div className="kc-nav-divider"></div>
      <div className="kc-user-avatar-box"
           style={{ background: colorForName(observer.name || 'observer') }}
           title={observer.name}>
        {avatarLetter(observer.name)}
        <span className="pdot"></span>
      </div>
    </div>
  );
}

function Sidebar({ active, onPick, repos, agentsByRepo, repoUnread = {}, dmUnread = {}, onRepoContextMenu }) {
  const [showChannels, setShowChannels] = React.useState(true);
  const [showDms, setShowDms] = React.useState(true);

  const allAgents = [];
  const seen = new Set();
  for (const list of Object.values(agentsByRepo)) {
    for (const a of list) {
      if (!seen.has(a.id)) { seen.add(a.id); allAgents.push(a); }
    }
  }
  const sortedDms = sortAgents(allAgents, dmUnread);

  return (
    <div className="kc-side">
      <div className="kc-workspace-header">
        <div className="name">Agents Online <span style={{ fontSize: 10, color: 'var(--kc-text-mute)' }}>▾</span></div>
      </div>
      <div className="kc-side-list">
        <button className="kc-quick-row" onClick={() => onPick('__activity')}>
          <span className="ico">⚡</span><span>Activity</span>
        </button>
        <button className="kc-quick-row" onClick={() => onPick('__claims')}>
          <span className="ico">📁</span><span>File Targets</span>
        </button>
        <button className="kc-quick-row" onClick={() => onPick('__settings')}>
          <span className="ico">⚙</span><span>Settings</span>
        </button>

        <button className="kc-side-section" onClick={() => setShowChannels((s) => !s)}>
          <span className="caret">{showChannels ? '▾' : '▸'}</span>
          <span className="label"># Repos</span>
        </button>
        {showChannels && repos.length === 0 && (
          <div style={{ padding: '4px 16px', fontSize: 12, color: 'var(--kc-text-mute)' }}>
            No repos yet.
          </div>
        )}
        {showChannels && repos.map((r) => {
          const unread = repoUnread[r.repoPath] || 0;
          const isActive = active === r.repoPath;
          return (
            <button key={r.repoPath}
                    className={`kc-chan-row ${isActive ? 'active' : ''}`}
                    onClick={() => onPick(r.repoPath)}
                    onContextMenu={(e) => onRepoContextMenu && onRepoContextMenu(e, r)}
                    title="right-click for options"
                    style={unread > 0 && !isActive ? { color: 'var(--kc-text-bright)' } : undefined}>
              <span className="icn">#</span>
              <span className="name" style={unread > 0 && !isActive ? { fontWeight: 700 } : undefined}>{r.basename}</span>
              {unread > 0 && <UnreadPill n={unread} />}
            </button>
          );
        })}

        <button className="kc-side-section" onClick={() => setShowDms((s) => !s)}>
          <span className="caret">{showDms ? '▾' : '▸'}</span>
          <span className="label">Direct messages</span>
        </button>
        {showDms && sortedDms.length === 0 && (
          <div style={{ padding: '4px 16px', fontSize: 12, color: 'var(--kc-text-mute)' }}>
            No agents online.
          </div>
        )}
        {showDms && sortedDms.map((a) => {
          const unread = dmUnread[a.id] || 0;
          const isActive = active === 'dm:' + a.id;
          return (
            <button key={a.id}
                    className={`kc-sd-dm ${isActive ? 'active' : ''}`}
                    onClick={() => onPick('dm:' + a.id)}
                    style={unread > 0 && !isActive ? { color: 'var(--kc-text-bright)' } : undefined}>
              <div className="av" style={{ background: a.color || colorForName(a.name) }}>
                {avatarLetter(a.name)}
                <span className={`dt ${STATUS_DOT[a.status] || 'dt-idle'}`}></span>
              </div>
              <span className="name" style={unread > 0 && !isActive ? { fontWeight: 700 } : undefined}>{a.name}</span>
              {unread > 0 && <UnreadPill n={unread} />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Main(props) {
  const { active } = props;
  if (active === '__friends')   return <FriendsView {...props} />;
  if (active === '__activity')  return <ActivityView {...props} />;
  if (active === '__claims')    return <ClaimsView {...props} />;
  if (active === '__settings')  return <SettingsView {...props} />;
  if (active.startsWith('dm:')) return <DMView {...props} />;
  return <ChannelView {...props} />;
}

function MessagesView({ messages, byId, observer }) {
  const ref = React.useRef(null);
  React.useEffect(() => { if (ref.current) ref.current.scrollTop = ref.current.scrollHeight; }, [messages]);
  let lastWho = null;
  return (
    <div className="kc-msgs" ref={ref}>
      <div className="kc-day-pill"><div className="line"></div><div className="pill">Today</div><div className="line"></div></div>
      {messages.length === 0 && (
        <div style={{ padding: '12px 24px', color: 'var(--kc-text-mute)', fontStyle: 'italic' }}>
          No messages yet.
        </div>
      )}
      {messages.map((m) => {
        const a = byId[m.from];
        const name = m.fromName || a?.name || (m.from === observer.id ? observer.name : m.from);
        const color = a?.color || colorForName(name);
        const compact = lastWho === m.from;
        lastWho = m.from;
        return (
          <div key={m.id} className={`kc-row ${compact ? 'compact' : ''}`}>
            <div className="kc-av-lg" style={{ background: color }}>{avatarLetter(name)}</div>
            <div className="body">
              <div className="kc-row-head">
                <span className="name">{name}</span>
                <span className="ts">{tsHM(m.ts)}</span>
              </div>
              <div className="text">{m.body}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Composer({ placeholder, onSend, disabled }) {
  const [v, setV] = React.useState('');
  const send = () => {
    if (!v.trim() || disabled) return;
    onSend(v.trim());
    setV('');
  };
  return (
    <div className="kc-composer">
      <div className="kc-composer-box">
        <div className="kc-composer-input">
          <input
            value={v}
            disabled={disabled}
            onChange={(e) => setV(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder={disabled ? 'unavailable' : placeholder}
          />
        </div>
        <div className="kc-composer-actions">
          <div className="left">
            <button title="Add">＋</button>
            <button title="Emoji">☻</button>
          </div>
          <div className="right">
            <button className="kc-send-btn" title="Send" onClick={send}>➤</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ChannelHeader({ name, count }) {
  return (
    <div className="kc-chan-header">
      <div className="title">
        <span># {name}</span>
      </div>
      <div className="kc-chan-header-right">
        {count != null && <div className="kc-pill" title="Members">👥 {count}</div>}
        <button className="kc-icon-btn" title="More">⋯</button>
      </div>
    </div>
  );
}

function ChannelView({ repoMeta, messages, byId, sendActive, observer, allAgents }) {
  if (!repoMeta) {
    return (
      <div className="kc-main">
        <div className="kc-chan-header"><div className="title"><span>no repo</span></div></div>
        <div style={{ flex: 1, padding: 24, color: 'var(--kc-text-mute)' }}>
          Pick a repo on the left or have an agent register one.
        </div>
      </div>
    );
  }
  const liveCount = allAgents.filter((a) => a.repoPath === repoMeta.repoPath && a.status !== 'offline' && a.status !== 'away').length;
  return (
    <div className="kc-main">
      <ChannelHeader name={repoMeta.basename} count={liveCount} />
      <MessagesView messages={messages} byId={byId} observer={observer} />
      <Composer placeholder={`Message #${repoMeta.basename}`} onSend={sendActive} />
    </div>
  );
}

function DMView({ dmAgent, dmLog, byId, sendActive, observer }) {
  if (!dmAgent) {
    return (
      <div className="kc-main">
        <div className="kc-chan-header"><div className="title"><span>DM</span></div></div>
        <div style={{ flex: 1, padding: 24, color: 'var(--kc-text-mute)' }}>This agent isn't online.</div>
      </div>
    );
  }
  const unreachable = dmAgent.status === 'offline' || dmAgent.status === 'away';
  return (
    <div className="kc-main">
      <div className="kc-chan-header">
        <div className="title">
          <Avatar name={dmAgent.name} color={dmAgent.color} status={dmAgent.status} size="mini" />
          <span style={{ marginLeft: 8 }}>{dmAgent.name}</span>
          <span style={{ fontSize: 12, color: 'var(--kc-text-mute)', fontWeight: 400, marginLeft: 8 }}>
            · {basename(dmAgent.repoPath)} · {STATUS_LABEL[dmAgent.status] || dmAgent.status}
          </span>
        </div>
      </div>
      <MessagesView messages={dmLog} byId={byId} observer={observer} />
      <Composer placeholder={`Message ${dmAgent.name}`} onSend={sendActive} disabled={unreachable} />
    </div>
  );
}

function FriendsView({ allAgents, onOpenDM, dmUnread = {} }) {
  const sorted = sortAgents(allAgents, dmUnread);
  return (
    <div className="kc-main">
      <div className="kc-chan-header"><div className="title"><span>👥 Friends</span></div></div>
      <div className="kc-info-panel">
        {sorted.length === 0 && <div style={{ color: 'var(--kc-text-mute)' }}>No agents have registered yet.</div>}
        {sorted.map((a) => {
          const unread = dmUnread[a.id] || 0;
          return (
            <div key={a.id} style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0',
              borderBottom: '1px solid rgba(255,255,255,0.05)', cursor: 'pointer',
            }} onClick={() => onOpenDM(a)}>
              <Avatar name={a.name} color={a.color} status={a.status} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: 'var(--kc-text-bright)', fontSize: 14, fontWeight: 700 }}>{a.name}</div>
                <div style={{ color: 'var(--kc-text-mute)', fontSize: 12 }}>
                  {STATUS_LABEL[a.status] || a.status}
                  {a.currentFile ? ' · ' + basename(a.currentFile) : ''}
                  {' · '}{basename(a.repoPath)}
                </div>
              </div>
              <button
                className="kc-icon-btn"
                style={{
                  width: 36, height: 28,
                  background: unread > 0 ? 'var(--kc-red)' : 'transparent',
                  color: unread > 0 ? '#fff' : 'var(--kc-text-mute)',
                  position: 'relative',
                  borderRadius: 6,
                }}
                title={unread > 0 ? `${unread} unread` : 'Message'}
                onClick={(e) => { e.stopPropagation(); onOpenDM(a); }}
              >
                💬
                {unread > 0 && (
                  <span style={{
                    position: 'absolute', top: -4, right: -4,
                    background: 'var(--kc-red)', color: '#fff',
                    fontSize: 10, fontWeight: 700,
                    padding: '0 5px', borderRadius: 8,
                    border: '2px solid var(--kc-main-bg)',
                    minWidth: 16, textAlign: 'center',
                  }}>{unread}</span>
                )}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ActivityView({ activity }) {
  const ref = React.useRef(null);
  React.useEffect(() => { if (ref.current) ref.current.scrollTop = ref.current.scrollHeight; }, [activity]);
  return (
    <div className="kc-main">
      <ChannelHeader name="activity" count={null} />
      <div ref={ref} className="kc-info-panel mono">
        {activity.length === 0 && <div style={{ color: 'var(--kc-text-mute)' }}>no events yet</div>}
        {activity.map((e) => (
          <div key={e.id} style={{ padding: '4px 0' }}>
            <span style={{ color: 'var(--kc-text-mute)' }}>{tsHMS(e.ts)}</span>{' '}
            <span style={{ color: 'var(--kc-accent)' }}>[{e.kind.padEnd(8, ' ')}]</span>{' '}
            <span style={{ color: 'var(--kc-text-bright)' }}>{e.agentName}</span>
            {e.target && <span style={{ color: 'var(--kc-yellow)' }}> {e.target}</span>}
            {e.body && <span style={{ color: 'var(--kc-text-mute)' }}> · {e.body}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

function ClaimsView({ claims, byId, onOpenDM }) {
  return (
    <div className="kc-main">
      <ChannelHeader name="file-targets" count={claims.length} />
      <div className="kc-info-panel">
        {claims.length === 0 && <div style={{ color: 'var(--kc-text-mute)' }}>no active claims</div>}
        {claims.map((c) => {
          const a = byId[c.agentId];
          return (
            <div key={c.id} style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0',
              borderBottom: '1px solid rgba(255,255,255,0.05)',
            }}>
              <Avatar name={c.agentName} color={a?.color} status={a?.status || 'editing'} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: 'var(--kc-text-bright)', fontSize: 14, fontWeight: 700 }}>
                  {c.agentName}{' '}
                  <span style={{ color: 'var(--kc-text-mute)', fontFamily: 'ui-monospace, monospace', fontWeight: 500 }}>
                    {c.file}
                  </span>
                </div>
                <div style={{ color: 'var(--kc-text-mute)', fontSize: 12 }}>
                  {c.mode}{c.reason ? ' · ' + c.reason : ''}
                  {c.waiters && c.waiters.length > 0 && ` · ${c.waiters.length} waiting`}
                </div>
              </div>
              <span className="kc-pill">{c.mode}</span>
              {a && (
                <button className="kc-icon-btn" title="Message" onClick={() => onOpenDM(a)}>💬</button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SettingsView({ settings, themes, onChangeSettings }) {
  return (
    <div className="kc-main">
      <ChannelHeader name="settings" count={null} />
      <div className="kc-settings-host">
        {SettingsPanel
          ? <SettingsPanel settings={settings} themes={themes} onChange={onChangeSettings} />
          : <div style={{ padding: 24, color: 'var(--kc-text-mute)' }}>Settings panel not loaded.</div>}
      </div>
    </div>
  );
}

window.AOL_THEME_SHELL = Shell;
