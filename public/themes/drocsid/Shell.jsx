/* global React */
/* Drocsid Shell — modern dark chat-app, fills viewport.
   Layout: server rail · channel sidebar · main · member list. */

const { devlog, colorForName, avatarLetter, basename, tsHM, tsHMS, relTime } = window.AOL_DATA;
const { Settings: SettingsPanel } = window.AOL_WINDOWS;

const STATUS_DOT = {
  online: 'dot-online', idle: 'dot-idle', editing: 'dot-editing',
  reviewing: 'dot-reviewing', waiting: 'dot-waiting', complete: 'dot-online',
  away: 'dot-away', offline: 'dot-offline', abandoned: 'dot-offline',
};
const STATUS_LABEL = {
  online: 'online', idle: 'idle', editing: 'editing',
  reviewing: 'reviewing', waiting: 'waiting', complete: 'done',
  away: 'away', offline: 'offline', abandoned: 'abandoned',
};

// Sort agents: online (incl. busy/working states) first, offline+away last;
// within each group, agents with unread DMs first, then alphabetical.
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
      background: 'var(--red)', color: '#fff',
      fontSize: 11, fontWeight: 700,
      padding: '1px 6px', borderRadius: 10,
      minWidth: 18, textAlign: 'center', lineHeight: 1.4,
      flexShrink: 0,
    }}>{n}</span>
  );
}

function Avatar({ name, color, size = 'md', status }) {
  const cls = size === 'lg' ? 'ds-avatar-lg' : size === 'mini' ? 'ds-avatar-mini' : 'ds-avatar-md';
  const dotCls = status ? STATUS_DOT[status] || 'dot-idle' : null;
  return (
    <div className={cls} style={{ background: color || colorForName(name || '?') }}>
      {avatarLetter(name)}
      {dotCls && <span className={`dot ${dotCls}`}></span>}
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

  // active selection: a repoPath, or '__friends', '__activity', '__claims', '__settings', or 'dm:<agentId>'
  const [activeRaw, setActiveRaw] = React.useState(() => repos[0]?.repoPath ?? '__friends');
  const [repoMenu, setRepoMenu] = React.useState(null); // { x, y, repo } | null
  const [repoUnread, setRepoUnread] = React.useState({}); // { [repoPath]: count }
  const [dmUnread, setDmUnread] = React.useState({});     // { [agentId]: count }

  const [activityUnread, setActivityUnread] = React.useState(0);
  const [claimsUnread, setClaimsUnread] = React.useState(0);

  // setActive that resets the unread counter for whatever you're switching INTO.
  const active = activeRaw;
  const setActive = React.useCallback((next) => {
    setActiveRaw(next);
    if (next.startsWith('dm:')) {
      setDmUnread((u) => ({ ...u, [next.slice(3)]: 0 }));
    } else if (next === '__activity') {
      setActivityUnread(0);
    } else if (next === '__claims') {
      setClaimsUnread(0);
    } else if (!next.startsWith('__')) {
      setRepoUnread((u) => ({ ...u, [next]: 0 }));
    }
  }, []);

  // Track new incoming messages; bump unread counters when the user isn't
  // currently looking at that repo / DM. On the very first effect run we
  // snapshot lengths of *existing* keys (so pre-mount scrollback doesn't
  // explode the counter), but any key that appears LATER counts from 0.
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

  // Activity / file-targets unread tracking — same first-sight discipline.
  const prevActivityLenRef = React.useRef(0);
  const activitySeededRef = React.useRef(false);
  const CLAIM_KINDS = React.useMemo(() => new Set(['claim', 'release', 'complete']), []);
  React.useEffect(() => {
    if (!activitySeededRef.current) {
      prevActivityLenRef.current = activity.length;
      activitySeededRef.current = true;
      return;
    }
    if (activity.length > prevActivityLenRef.current) {
      const fresh = activity.slice(prevActivityLenRef.current);
      if (active !== '__activity') {
        setActivityUnread((u) => u + fresh.length);
      }
      const claimEvents = fresh.filter((e) => CLAIM_KINDS.has(e.kind)).length;
      if (claimEvents > 0 && active !== '__claims') {
        devlog('unread', 'claims +', claimEvents);
        setClaimsUnread((u) => u + claimEvents);
      }
      prevActivityLenRef.current = activity.length;
    }
  }, [activity, active, CLAIM_KINDS]);

  // Close the menu on any click anywhere. (Don't close on contextmenu — the
  // same right-click that opened the menu would otherwise close it.)
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

  // Hydrate the active repo's messages on selection change. Stable sentinels
  // (__friends, __activity, ...) skip hydration.
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

  // If we boot with no repos, snap to friends view; once a repo arrives, prefer it.
  React.useEffect(() => {
    if (active === '__friends' && repos.length > 0) setActive(repos[0].repoPath);
  }, [repos.length]);

  devlog('shell', 'drocsid render', { active, repos: repos.length });

  const allAgents = Object.values(agentsByRepo).flat();
  const byId = React.useMemo(() => {
    const m = {};
    for (const a of allAgents) m[a.id] = a;
    return m;
  }, [allAgents]);

  const activeAgents = active.startsWith('__') || active.startsWith('dm:')
    ? []
    : (agentsByRepo[active] || []);

  const repoMeta = repos.find((r) => r.repoPath === active) || null;
  const dmAgent = active.startsWith('dm:') ? byId[active.slice(3)] : null;

  const sendActive = (text) => {
    if (active.startsWith('__') || !text.trim()) return;
    if (active.startsWith('dm:')) sendDM(active.slice(3), text);
    else sendRoom(active, text);
  };

  return (
    <div className="ds-app">
      <Rail
        active={active}
        onPickFriends={() => setActive('__friends')}
        onPickServer={() => setActive(repos[0]?.repoPath || '__friends')}
        onPickActivity={() => setActive('__activity')}
        onPickClaims={() => setActive('__claims')}
        onPickSettings={() => setActive('__settings')}
        observer={observer}
        totalDmUnread={totalDmUnread}
        activityUnread={activityUnread}
        claimsUnread={claimsUnread}
      />
      <Sidebar
        active={active}
        onPick={setActive}
        repos={repos}
        agentsByRepo={agentsByRepo}
        observer={observer}
        settings={settings}
        repoUnread={repoUnread}
        dmUnread={dmUnread}
        activityUnread={activityUnread}
        claimsUnread={claimsUnread}
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
        agents={allAgents}
        activeRepoAgents={activeAgents}
        activity={activity}
        claims={claims}
        settings={settings}
        themes={themes}
        dmUnread={dmUnread}
        onChangeSettings={setSettings}
        onOpenDM={(agent) => setActive('dm:' + agent.id)}
      />
      {!active.startsWith('__') && !active.startsWith('dm:') && repoMeta && (
        <MemberList
          agents={activeAgents}
          observer={observer}
          onOpenDM={(agent) => setActive('dm:' + agent.id)}
        />
      )}
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
        <div className="ds-error-banner" onClick={dismissError}>
          {errorBanner} (click to dismiss)
        </div>
      )}
    </div>
  );
}

function RepoContextMenu({ x, y, repo, agents, onOpenChat, onHide }) {
  const canHide = agents.length === 0 || agents.every((a) => a.status === 'offline');
  return (
    <div
      style={{
        position: 'fixed', left: x, top: y, zIndex: 99999,
        background: 'var(--bg-side)',
        border: '1px solid var(--line)',
        boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
        borderRadius: 4,
        padding: 4, minWidth: 180,
        color: 'var(--text)',
        fontSize: 13,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div
        style={{ padding: '6px 10px', cursor: 'pointer', borderRadius: 3 }}
        onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
        onClick={onOpenChat}
      >Open chat</div>
      <div
        style={{
          padding: '6px 10px',
          cursor: canHide ? 'pointer' : 'not-allowed',
          color: canHide ? 'var(--red)' : 'var(--text-mute)',
          borderRadius: 3,
        }}
        title={canHide ? '' : 'all agents in this repo must be offline first'}
        onMouseEnter={(e) => { if (canHide) e.currentTarget.style.background = 'var(--bg-hover)'; }}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
        onClick={() => { if (canHide) onHide(); }}
      >Hide repo{canHide ? '' : ' (agents online)'}</div>
    </div>
  );
}

function Rail({ active, onPickFriends, onPickServer, onPickActivity, onPickClaims, onPickSettings, observer, totalDmUnread, activityUnread = 0, claimsUnread = 0 }) {
  const onDmView = active === '__friends' || active.startsWith('dm:');
  return (
    <div className="ds-rail">
      <div className={`ds-rail-item ${onDmView ? 'active' : ''}`}
           onClick={onPickFriends}>
        DM
        {totalDmUnread > 0 && <span className="ds-rail-badge">{totalDmUnread}</span>}
        <span className="ds-rail-tip">Direct Messages{totalDmUnread > 0 ? ` · ${totalDmUnread} unread` : ''}</span>
      </div>
      <div className="ds-rail-divider"></div>
      <div className={`ds-rail-item ${!active.startsWith('__') && !active.startsWith('dm:') ? 'active' : ''}`}
           style={{ background: '#1f5378', color: '#fff' }}
           onClick={onPickServer}>
        AO<span className="ds-rail-tip">Repos</span>
      </div>
      <div className={`ds-rail-item ${active === '__activity' ? 'active' : ''}`}
           style={{ fontSize: 16 }}
           onClick={onPickActivity}>
        ⚡
        {activityUnread > 0 && <span className="ds-rail-badge">{activityUnread}</span>}
        <span className="ds-rail-tip">Activity{activityUnread > 0 ? ` · ${activityUnread} new` : ''}</span>
      </div>
      <div className={`ds-rail-item ${active === '__claims' ? 'active' : ''}`}
           style={{ fontSize: 16 }}
           onClick={onPickClaims}>
        📁
        {claimsUnread > 0 && <span className="ds-rail-badge">{claimsUnread}</span>}
        <span className="ds-rail-tip">File Claims{claimsUnread > 0 ? ` · ${claimsUnread} new` : ''}</span>
      </div>
      <div className="ds-rail-divider"></div>
      <div className={`ds-rail-item ${active === '__settings' ? 'active' : ''}`}
           style={{ fontSize: 18 }}
           onClick={onPickSettings}>
        ⚙<span className="ds-rail-tip">Settings</span>
      </div>
    </div>
  );
}

function Sidebar({ active, onPick, repos, agentsByRepo, observer, settings, repoUnread, dmUnread, activityUnread = 0, claimsUnread = 0, onRepoContextMenu }) {
  // DM home view: list all repos' agents (deduped) so the user can DM anyone.
  if (active === '__friends' || active.startsWith('dm:')) {
    const allAgents = [];
    const seen = new Set();
    for (const list of Object.values(agentsByRepo)) {
      for (const a of list) {
        if (!seen.has(a.id)) { seen.add(a.id); allAgents.push(a); }
      }
    }
    const sortedDms = sortAgents(allAgents, dmUnread);
    return (
      <div className="ds-sidebar">
        <div className="ds-sidebar-header">Direct Messages</div>
        <div className="ds-sidebar-list">
          <div className={`ds-channel-row ${active === '__friends' ? 'active' : ''}`}
               onClick={() => onPick('__friends')}>
            <span className="hash" style={{ fontSize: 16 }}>👥</span>
            <span className="name">Friends</span>
          </div>
          <div className="ds-sidebar-section"><span>All Agents</span></div>
          {sortedDms.length === 0 && (
            <div style={{ padding: '8px 16px', fontSize: 12, color: 'var(--text-mute)' }}>
              No agents online yet.
            </div>
          )}
          {sortedDms.map((a) => {
            const unread = dmUnread[a.id] || 0;
            return (
              <div key={a.id}
                   className={`ds-dm-row ${active === 'dm:' + a.id ? 'active' : ''}`}
                   onClick={() => onPick('dm:' + a.id)}
                   style={unread > 0 ? { color: 'var(--text-bright)' } : undefined}>
                <Avatar name={a.name} color={a.color} size="mini" status={a.status} />
                <span className="name" style={unread > 0 ? { fontWeight: 600 } : undefined}>{a.name}</span>
                {unread > 0 && <UnreadPill n={unread} />}
              </div>
            );
          })}
        </div>
        <UserPill observer={observer} settings={settings} onPickSettings={() => onPick('__settings')} />
      </div>
    );
  }

  // Server view: channels = repos.
  return (
    <div className="ds-sidebar">
      <div className="ds-sidebar-header">
        Agents Online
        <span className="caret">▾</span>
      </div>
      <div className="ds-sidebar-list">
        <div className="ds-sidebar-section"><span>Repos</span></div>
        {repos.length === 0 && (
          <div style={{ padding: '8px 16px', fontSize: 12, color: 'var(--text-mute)' }}>
            No repos yet — agents register their repo on join.
          </div>
        )}
        {repos.map((r) => {
          const liveCount = (agentsByRepo[r.repoPath] || []).filter((a) => a.status !== 'offline' && a.status !== 'away').length;
          const unread = repoUnread[r.repoPath] || 0;
          const isActive = active === r.repoPath;
          return (
            <div key={r.repoPath}
                 className={`ds-channel-row ${isActive ? 'active' : ''}`}
                 onClick={() => onPick(r.repoPath)}
                 onContextMenu={(e) => onRepoContextMenu && onRepoContextMenu(e, r)}
                 title="right-click for options"
                 style={unread > 0 && !isActive ? { color: 'var(--text-bright)' } : undefined}>
              <span className="hash">#</span>
              <span className="name" style={unread > 0 && !isActive ? { fontWeight: 600 } : undefined}>{r.basename}</span>
              {unread > 0
                ? <UnreadPill n={unread} />
                : (liveCount > 0 && <span style={{ fontSize: 11, color: 'var(--text-mute)' }}>{liveCount}</span>)}
            </div>
          );
        })}
        <div className="ds-sidebar-section"><span>Observability</span></div>
        <div className={`ds-channel-row ${active === '__activity' ? 'active' : ''}`}
             onClick={() => onPick('__activity')}
             style={activityUnread > 0 && active !== '__activity' ? { color: 'var(--text-bright)' } : undefined}>
          <span className="hash">#</span>
          <span className="name" style={activityUnread > 0 && active !== '__activity' ? { fontWeight: 600 } : undefined}>activity</span>
          {activityUnread > 0 && <UnreadPill n={activityUnread} />}
        </div>
        <div className={`ds-channel-row ${active === '__claims' ? 'active' : ''}`}
             onClick={() => onPick('__claims')}
             style={claimsUnread > 0 && active !== '__claims' ? { color: 'var(--text-bright)' } : undefined}>
          <span className="hash">#</span>
          <span className="name" style={claimsUnread > 0 && active !== '__claims' ? { fontWeight: 600 } : undefined}>file-targets</span>
          {claimsUnread > 0 && <UnreadPill n={claimsUnread} />}
        </div>
      </div>
      <UserPill observer={observer} settings={settings} onPickSettings={() => onPick('__settings')} />
    </div>
  );
}

function UserPill({ observer, settings, onPickSettings }) {
  return (
    <div className="ds-user-pill">
      <div className="ds-avatar" style={{ background: colorForName(observer.name || 'observer') }}>
        {avatarLetter(observer.name)}
        <span className="dot"></span>
      </div>
      <div className="who">
        <div className="name">{observer.name || 'observer'}</div>
        <div className="sub">{settings?.['theme.active'] || 'aol'} · :3312</div>
      </div>
      <button className="ds-icon-btn" title="Settings" onClick={onPickSettings}>⚙</button>
    </div>
  );
}

function Main(props) {
  const { active } = props;
  if (active === '__friends')   return <FriendsPanel {...props} />;
  if (active === '__activity')  return <ActivityPanel {...props} />;
  if (active === '__claims')    return <ClaimsPanel {...props} />;
  if (active === '__settings')  return <SettingsView {...props} />;
  if (active.startsWith('dm:')) return <DMView {...props} />;
  return <ChannelView {...props} />;
}

function ChannelHeader({ name, topic, count }) {
  return (
    <div className="ds-main-header">
      <span className="hash">#</span>
      <span className="name">{name}</span>
      {topic && <span className="topic">{topic}</span>}
      {count != null && (
        <button className="ds-icon-btn" title="Members" style={{ width: 'auto', padding: '0 8px' }}>👥 {count}</button>
      )}
    </div>
  );
}

function MessagesView({ messages, byId, observer }) {
  const ref = React.useRef(null);
  React.useEffect(() => { if (ref.current) ref.current.scrollTop = ref.current.scrollHeight; }, [messages]);
  let lastWho = null;
  return (
    <div className="ds-messages" ref={ref}>
      <div className="ds-day-divider"><div className="line"></div><span>Today</span><div className="line"></div></div>
      {messages.length === 0 && (
        <div style={{ padding: '12px 16px', color: 'var(--text-mute)', fontStyle: 'italic' }}>
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
          <div key={m.id} className={`ds-msg-group ${compact ? 'compact' : ''}`}>
            <Avatar name={name} color={color} size="lg" />
            <div className="ds-msg-body">
              <div className="ds-header-line">
                <span className="name" style={{ color }}>{name}</span>
                <span className="ts">{tsHM(m.ts)}</span>
              </div>
              <div className="text">
                {m.body}
                {m.warnings && m.warnings.length > 0 && (
                  <span className="warn" title={m.warnings.join('; ')}>⚠</span>
                )}
              </div>
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
    <div className="ds-composer">
      <div className="ds-composer-box">
        <span className="plus">+</span>
        <input
          value={v}
          disabled={disabled}
          onChange={(e) => setV(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
          placeholder={disabled ? 'unavailable' : placeholder}
        />
      </div>
    </div>
  );
}

function ChannelView({ repoMeta, messages, byId, sendActive, observer, activeRepoAgents }) {
  if (!repoMeta) {
    return (
      <div className="ds-main">
        <div className="ds-main-header"><span className="name">no repo</span></div>
        <div style={{ flex: 1, padding: 24, color: 'var(--text-mute)' }}>
          Pick a repo on the left or have an agent register one.
        </div>
      </div>
    );
  }
  const liveCount = activeRepoAgents.filter((a) => a.status !== 'offline' && a.status !== 'away').length;
  return (
    <div className="ds-main">
      <ChannelHeader name={repoMeta.basename} topic={repoMeta.repoPath} count={liveCount} />
      <MessagesView messages={messages} byId={byId} observer={observer} />
      <Composer placeholder={`Message #${repoMeta.basename}`} onSend={sendActive} />
    </div>
  );
}

function DMView({ dmAgent, dmLog, byId, sendActive, observer }) {
  if (!dmAgent) {
    return (
      <div className="ds-main">
        <div className="ds-main-header"><span className="name">DM</span></div>
        <div style={{ flex: 1, padding: 24, color: 'var(--text-mute)' }}>This agent isn't online right now.</div>
      </div>
    );
  }
  const unreachable = dmAgent.status === 'offline' || dmAgent.status === 'away';
  return (
    <div className="ds-main">
      <div className="ds-main-header">
        <Avatar name={dmAgent.name} color={dmAgent.color} status={dmAgent.status} />
        <span className="name" style={{ marginLeft: 8 }}>{dmAgent.name}</span>
        <span className="topic">{basename(dmAgent.repoPath)} · {STATUS_LABEL[dmAgent.status] || dmAgent.status}</span>
      </div>
      <MessagesView messages={dmLog} byId={byId} observer={observer} />
      <Composer
        placeholder={`Message @${dmAgent.name}`}
        onSend={sendActive}
        disabled={unreachable}
      />
    </div>
  );
}

function FriendsPanel({ agents, onOpenDM, dmUnread = {} }) {
  const sorted = sortAgents(agents, dmUnread);
  return (
    <div className="ds-main">
      <div className="ds-main-header">
        <span style={{ fontSize: 18, marginRight: 8 }}>👥</span>
        <span className="name">Friends</span>
        <span className="topic">All sub-agents across every repo</span>
      </div>
      <div className="ds-friends-panel">
        <div style={{ fontSize: 12, color: 'var(--text-mute)', fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', padding: '8px 0' }}>
          All Agents — {agents.length}
        </div>
        {agents.length === 0 && <div style={{ color: 'var(--text-mute)' }}>No agents have registered yet.</div>}
        {sorted.map((a) => {
          const unread = dmUnread[a.id] || 0;
          return (
            <div key={a.id} className="ds-friend-row" onClick={() => onOpenDM(a)}>
              <Avatar name={a.name} color={a.color} status={a.status} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: 'var(--text-bright)', fontSize: 15, fontWeight: 600 }}>{a.name}</div>
                <div style={{ color: 'var(--text-mute)', fontSize: 13 }}>
                  {STATUS_LABEL[a.status] || a.status}
                  {a.currentFile ? ' · ' + basename(a.currentFile) : ''}
                  {' · '}{basename(a.repoPath)}
                </div>
              </div>
              <button
                className="ds-icon-btn"
                style={{
                  width: 36, height: 36,
                  background: unread > 0 ? 'var(--red)' : 'var(--bg-active)',
                  color: unread > 0 ? '#fff' : 'var(--text-mute)',
                  position: 'relative',
                }}
                title={unread > 0 ? `${unread} unread message${unread === 1 ? '' : 's'}` : 'Message'}
                onClick={(e) => { e.stopPropagation(); onOpenDM(a); }}
              >
                💬
                {unread > 0 && (
                  <span style={{
                    position: 'absolute', top: -4, right: -4,
                    background: 'var(--red)', color: '#fff',
                    fontSize: 10, fontWeight: 700,
                    padding: '0 5px', borderRadius: 8,
                    border: '2px solid var(--bg-main)',
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

function ActivityPanel({ activity, byId }) {
  const ref = React.useRef(null);
  React.useEffect(() => { if (ref.current) ref.current.scrollTop = ref.current.scrollHeight; }, [activity]);
  return (
    <div className="ds-main">
      <ChannelHeader name="activity" topic="Live event stream from the daemon" count={null} />
      <div ref={ref} className="ds-info-panel mono">
        {activity.length === 0 && <div style={{ color: 'var(--text-mute)' }}>no events yet</div>}
        {activity.map((e) => (
          <div key={e.id} className="ds-info-row">
            <span className="ts">{tsHMS(e.ts)}</span>{' '}
            <span className={'ev-' + (e.kind === 'msg' || e.kind === 'dm' ? 'msg' : e.kind)}>[{e.kind.padEnd(8, ' ')}]</span>{' '}
            <span className="who">{e.agentName}</span>{' '}
            {e.target && <span style={{ color: '#fb0' }}>{e.target} </span>}
            {e.body && <span style={{ color: 'var(--text-mute)' }}> · {e.body}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

function ClaimsPanel({ claims, byId, onOpenDM }) {
  return (
    <div className="ds-main">
      <ChannelHeader name="file-targets" topic="Active file claims with waiter queues" count={claims.length} />
      <div className="ds-info-panel">
        {claims.length === 0 && <div style={{ color: 'var(--text-mute)' }}>no active claims</div>}
        {claims.map((c) => {
          const a = byId[c.agentId];
          const status = a?.status || 'editing';
          return (
            <div key={c.id} className="ds-claim-row">
              <Avatar name={c.agentName} color={a?.color} status={status} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: 'var(--text-bright)', fontSize: 14, fontWeight: 600 }}>
                  {c.agentName} <span style={{ color: 'var(--text-mute)', fontFamily: 'ui-monospace, monospace', fontWeight: 500, marginLeft: 8 }}>{c.file}</span>
                </div>
                <div style={{ color: 'var(--text-mute)', fontSize: 13 }}>
                  {c.mode}{c.reason ? ' · ' + c.reason : ''}
                  {c.waiters && c.waiters.length > 0 && ` · ${c.waiters.length} waiting`}
                </div>
              </div>
              <span className="ds-pill">{c.mode}</span>
              {a && <button className="ds-icon-btn" title="Message" onClick={() => onOpenDM(a)}>💬</button>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SettingsView({ settings, themes, onChangeSettings }) {
  return (
    <div className="ds-main">
      <div className="ds-main-header">
        <span style={{ fontSize: 18, marginRight: 8 }}>⚙</span>
        <span className="name">Settings</span>
      </div>
      <div className="ds-settings-host">
        {SettingsPanel
          ? <SettingsPanel settings={settings} themes={themes} onChange={onChangeSettings} />
          : <div style={{ padding: 24, color: 'var(--text-mute)' }}>Settings panel not loaded.</div>}
      </div>
    </div>
  );
}

function MemberList({ agents, onOpenDM }) {
  const groups = { online: [], offline: [] };
  for (const a of agents) {
    if (a.status === 'offline') groups.offline.push(a);
    else groups.online.push(a);
  }
  return (
    <div className="ds-members">
      <div className="ds-members-section">Online — {groups.online.length}</div>
      {groups.online.map((a) => (
        <div key={a.id} className="ds-member-row" onClick={() => onOpenDM(a)}>
          <Avatar name={a.name} color={a.color} status={a.status} />
          <div className="body">
            <div className="name">{a.name}</div>
            <div className="sub">{STATUS_LABEL[a.status] || a.status}{a.currentFile ? ' · ' + basename(a.currentFile) : ''}</div>
          </div>
        </div>
      ))}
      {groups.offline.length > 0 && <div className="ds-members-section">Offline — {groups.offline.length}</div>}
      {groups.offline.map((a) => (
        <div key={a.id} className="ds-member-row offline" onClick={() => onOpenDM(a)}>
          <Avatar name={a.name} color={a.color} status="offline" />
          <div className="body">
            <div className="name">{a.name}</div>
            <div className="sub">offline</div>
          </div>
        </div>
      ))}
    </div>
  );
}

window.AOL_THEME_SHELL = Shell;
