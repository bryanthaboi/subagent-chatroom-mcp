/* global React */
const { Win, Icon, AolNet, STATUS_COLORS, colorForName, avatarLetter, basename, tsHM, tsHMS, relTime } = window.AOL_DATA;

// ===== Buddy List ========================================================
function BuddyList({
  repos, agentsByRepo, observerName,
  onOpenChatForRepo, onOpenDM, onOpenChatPicker,
  onOpenFiles, onOpenLog, onOpenAbout,
  onDelete, onHideRepo,
}) {
  const totalOnline = Object.values(agentsByRepo).flat()
    .filter(a => a.status !== 'offline' && a.status !== 'away').length;
  return (
    <>
      <div className="buddy-header">
        <img src="agentsonlinelogo.png" className="small-logo" alt="" />
        <div className="you">
          <b>{observerName || 'observer'}</b>
          <span style={{ fontSize: 11, color: '#444' }}>
            {repos.length} repo{repos.length === 1 ? '' : 's'} · {totalOnline} online
          </span>
        </div>
      </div>
      <div className="buddy-tabs">
        <div className="buddy-tab active">Buddies</div>
        <div className="buddy-tab" onClick={onOpenChatPicker}>Chat</div>
        <div className="buddy-tab" onClick={onOpenFiles}>Files</div>
        <div className="buddy-tab" onClick={onOpenLog}>Log</div>
      </div>
      <div className="buddy-list">
        {repos.length === 0 && (
          <div style={{ padding: 12, fontSize: 12, color: '#666', fontStyle: 'italic' }}>
            No agents have registered yet.
          </div>
        )}
        {repos.map((r) => (
          <RepoFolder key={r.repoPath}
            repo={r}
            agents={agentsByRepo[r.repoPath] || []}
            onOpenChatForRepo={onOpenChatForRepo}
            onOpenDM={onOpenDM}
            onDelete={onDelete}
            onHideRepo={onHideRepo}
          />
        ))}
      </div>
    </>
  );
}

const STATUS_ORDER = {
  online: 0, editing: 0, reviewing: 0,
  idle: 1, waiting: 1, complete: 1, abandoned: 1,
  away: 2, offline: 3,
};

function RepoFolder({ repo, agents, onOpenChatForRepo, onOpenDM, onDelete, onHideRepo }) {
  const [open, setOpen] = React.useState(true);
  const [menu, setMenu] = React.useState(null);
  const sorted = [...agents].sort((a, b) => (STATUS_ORDER[a.status] ?? 1) - (STATUS_ORDER[b.status] ?? 1));
  const live = sorted.filter(a => a.status !== 'offline' && a.status !== 'away').length;
  // Repo can be hidden only if every agent in it is offline (no online, no away).
  const canHide = sorted.length > 0 && sorted.every(a => a.status === 'offline');
  React.useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [menu]);
  return (
    <>
      <div
        className="buddy-group"
        onDoubleClick={() => onOpenChatForRepo(repo.repoPath)}
        onContextMenu={(e) => { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY }); }}
        title={`double-click to open #${repo.basename} chat · right-click for options`}
      >
        <span className="caret" onClick={(e) => { e.stopPropagation(); setOpen(o => !o); }}>{open ? '▼' : '▶'}</span>
        <span style={{ marginRight: 4 }}>{Icon.folder}</span>
        <span><b>{repo.basename}</b></span>
        <span className="count">({live}/{sorted.length})</span>
      </div>
      {menu && (
        <div
          style={{
            position: 'fixed', left: menu.x, top: menu.y, zIndex: 99999,
            background: '#fff', border: '1px solid #555', boxShadow: '2px 2px 0 #888',
            padding: 2, fontSize: 12, minWidth: 160,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="ctx-item" style={{ padding: '4px 10px', cursor: 'pointer' }}
               onClick={() => { onOpenChatForRepo(repo.repoPath); setMenu(null); }}>Open chat</div>
          <div
            className="ctx-item"
            style={{
              padding: '4px 10px',
              cursor: canHide ? 'pointer' : 'not-allowed',
              color: canHide ? '#a00' : '#999',
            }}
            title={canHide ? '' : 'all agents in this repo must be offline first'}
            onClick={() => { if (canHide) { onHideRepo(repo); setMenu(null); } }}
          >Hide repo{canHide ? '' : ' (agents online)'}</div>
        </div>
      )}
      {open && sorted.map((a) => (
        <BuddyRow key={a.id} agent={a} onOpenDM={onOpenDM} onDelete={onDelete} />
      ))}
      {open && sorted.length === 0 && (
        <div style={{ paddingLeft: 22, color: '#888', fontSize: 12, fontStyle: 'italic' }}>— nobody —</div>
      )}
    </>
  );
}

function tooltipForAgent(a) {
  if (a.status === 'away') {
    const since = a.awaySince ? tsHM(a.awaySince) : '?';
    return `away since ${since}: ${a.awayMessage || '...'}`;
  }
  if (a.status === 'offline') {
    const since = a.signedOffAt ? tsHM(a.signedOffAt) : '?';
    return `signed off ${since}` + (a.awayMessage ? ` — ${a.awayMessage}` : '');
  }
  return `signed on ${tsHM(a.createdAt)} · last seen ${relTime(a.lastSeen)}` + (a.role === 'observer' ? ' · observer' : '');
}

function BuddyRow({ agent, onOpenDM, onDelete }) {
  const [menu, setMenu] = React.useState(null);
  const a = agent;
  const onContext = (e) => {
    e.preventDefault();
    setMenu({ x: e.clientX, y: e.clientY });
  };
  React.useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [menu]);

  const dim = a.status === 'offline' || a.status === 'away';
  return (
    <>
      <div
        className="buddy-row"
        onDoubleClick={() => onOpenDM(a)}
        onContextMenu={onContext}
        title={tooltipForAgent(a)}
      >
        <span className="dot" style={{ background: STATUS_COLORS[a.status] || '#888' }}></span>
        <span className="name">
          {a.role === 'observer' && <span title="observer" style={{ marginRight: 3 }}>👁</span>}
          {a.name}
        </span>
        {a.status === 'editing' && <span className="badge" style={{ background: '#ffe5b4' }}>edit</span>}
        {a.status === 'reviewing' && <span className="badge" style={{ background: '#d4f0ff' }}>read</span>}
        {a.status === 'waiting' && <span className="badge" style={{ background: '#f0d4ff' }}>wait</span>}
        {a.status === 'complete' && <span className="badge">done</span>}
        {a.status === 'idle' && <span className="badge" style={{ background: '#fffbcc' }}>idle</span>}
        {a.status === 'abandoned' && <span className="badge" style={{ background: '#eee' }}>abandon</span>}
        {a.status === 'away' && <span className="badge" style={{ background: '#fef0c0' }}>away</span>}
        {a.status === 'offline' && <span className="badge" style={{ background: '#ddd' }}>offline</span>}
        {a.currentFile && <span style={{ marginLeft: 4, fontSize: 10, color: '#555' }}>· {basename(a.currentFile)}</span>}
      </div>
      {menu && (
        <div
          style={{
            position: 'fixed', left: menu.x, top: menu.y, zIndex: 99999,
            background: '#fff', border: '1px solid #555', boxShadow: '2px 2px 0 #888',
            padding: 2, fontSize: 12, minWidth: 130,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="ctx-item" style={{ padding: '4px 10px', cursor: 'pointer' }}
               onClick={() => { onOpenDM(a); setMenu(null); }}>IM…</div>
          {a.status === 'offline' && (
            <div className="ctx-item" style={{ padding: '4px 10px', cursor: 'pointer', color: '#a00' }}
                 onClick={() => { onDelete(a); setMenu(null); }}>Delete</div>
          )}
        </div>
      )}
    </>
  );
}

// ===== Chatroom ==========================================================
function ChatRoom({ repo, messages, agentCount, onSend, observerName, observerId, repoPath }) {
  const [text, setText] = React.useState('');
  const logRef = React.useRef(null);
  React.useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [messages]);
  const send = () => {
    if (!text.trim()) return;
    onSend(text.trim());
    setText('');
  };
  const title = repo ? `#${repo.basename}` : '#chat';
  return (
    <>
      <div className="chat-toolbar">
        <span style={{ fontWeight: 'bold' }}>{title}</span>
        <span style={{ color: '#666' }}>· {agentCount} in repo</span>
        <span style={{ marginLeft: 'auto', fontSize: 11, color: '#666' }}>
          {repoPath || ''}
        </span>
      </div>
      <div className="chat-log inset" ref={logRef} style={{ margin: 2 }}>
        {messages.length === 0 && (
          <div style={{ color: '#888', fontStyle: 'italic', padding: 6 }}>
            no messages in this repo's room yet — coordination will show up here as agents talk
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className="line">
            <span className="ts">[{tsHM(m.ts)}]</span>{' '}
            <span className="who" style={{ color: colorForName(m.fromName) }}>{m.fromName}:</span>{' '}
            <span>{m.body}</span>
            {m.warnings && m.warnings.length > 0 && (
              <span title={m.warnings.join('; ')} style={{ color: '#aa0000', marginLeft: 4 }}>⚠</span>
            )}
          </div>
        ))}
      </div>
      <div className="chat-input-area">
        <div className="chat-format-bar">
          <span style={{ marginLeft: 'auto', fontSize: 10, color: '#666' }}>posting as {observerName}</span>
        </div>
        <div className="chat-input-row">
          <textarea
            className="chat-input inset"
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder="post to this repo's room..."
          />
          <div className="chat-send">
            <button className="btn" onClick={send} style={{ flex: 1 }} disabled={!text.trim()}>Send</button>
            <button className="btn" onClick={() => setText(t => t + ' 🙂')}>:-)</button>
          </div>
        </div>
      </div>
    </>
  );
}

// ===== DM Window =========================================================
function DMWindow({ agent, log, onSend, observerName }) {
  const [text, setText] = React.useState('');
  const ref = React.useRef(null);
  React.useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [log]);
  const unreachable = agent.status === 'away' || agent.status === 'offline';
  const tip = unreachable ? `${agent.name} is ${agent.status} — you can't send right now` : '';
  const send = () => {
    if (unreachable) return;
    if (!text.trim()) return;
    onSend(agent.id, text.trim());
    setText('');
  };
  const ac = agent.color || colorForName(agent.name);
  return (
    <>
      <div style={{ background: '#fff', borderBottom: '1px solid #888', padding: '4px 6px', fontSize: 11, display: 'flex', alignItems: 'center', gap: 6 }}>
        <span className="avatar" style={{ width: 18, height: 18, fontSize: 11, background: ac, color: '#fff' }}>{avatarLetter(agent.name)}</span>
        <b style={{ color: ac }}>{agent.name}</b>
        <span style={{ color: '#666' }}>· {basename(agent.repoPath)}</span>
        <span style={{ marginLeft: 'auto', color: '#666' }}>{agent.status}</span>
      </div>
      <div className="dm-log inset" ref={ref} style={{ margin: 2 }}>
        {log.map((m) => (
          <div key={m.id} style={{ marginBottom: 2 }}>
            {m.from === agent.id ? (
              <><span className="who-them">{agent.name}:</span> {m.body}</>
            ) : (
              <><span className="who-you">{m.fromName || observerName}:</span> {m.body}</>
            )}
          </div>
        ))}
        {log.length === 0 && <div style={{ color: '#888', fontStyle: 'italic' }}>no messages yet</div>}
      </div>
      {unreachable && (
        <div style={{ padding: '4px 8px', background: '#fff5d0', borderTop: '1px solid #d8c878', fontSize: 11, color: '#7a5a00' }}>
          {agent.name} is {agent.status}. you can't send messages until they're back online.
        </div>
      )}
      <textarea
        className="dm-input"
        value={text}
        onChange={e => setText(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
        placeholder={unreachable ? tip : `message ${agent.name}...`}
        disabled={unreachable}
        title={tip}
        style={unreachable ? { background: '#f0f0f0', color: '#888', cursor: 'not-allowed' } : undefined}
      />
      <div style={{ padding: '0 4px 4px', display: 'flex', gap: 4 }}>
        <button
          className="btn"
          style={{ marginLeft: 'auto' }}
          onClick={send}
          disabled={unreachable || !text.trim()}
          title={tip}
        >Send</button>
      </div>
    </>
  );
}

// ===== File Targets =====================================================
function FileTargets({ claims, repos, scope, onScopeChange, onMessage, onForceRelease }) {
  const filtered = scope === 'all' ? claims : claims.filter(c => c.repoPath === scope);
  const byFile = {};
  for (const c of filtered) {
    if (!byFile[c.file]) byFile[c.file] = [];
    byFile[c.file].push(c);
  }
  const rows = Object.entries(byFile).sort();
  return (
    <>
      <div style={{ background: 'var(--face)', padding: '4px 6px', borderBottom: '1px solid #888', display: 'flex', gap: 8, fontSize: 12, alignItems: 'center' }}>
        <b>Active File Claims</b>
        <span style={{ color: '#666' }}>· {rows.length} file{rows.length === 1 ? '' : 's'} · {filtered.length} claim{filtered.length === 1 ? '' : 's'}</span>
        <span style={{ marginLeft: 'auto' }}>
          <label style={{ fontSize: 11, marginRight: 4 }}>repo:</label>
          <select value={scope} onChange={e => onScopeChange(e.target.value)}>
            <option value="all">all repos</option>
            {repos.map(r => <option key={r.repoPath} value={r.repoPath}>{r.basename}</option>)}
          </select>
        </span>
      </div>
      <div className="files-tbl inset" style={{ margin: 2 }}>
        <table>
          <thead>
            <tr>
              <th style={{ width: '28%' }}>File</th>
              <th style={{ width: '18%' }}>Holder</th>
              <th style={{ width: '12%' }}>Mode</th>
              <th>Reason</th>
              <th style={{ width: '14%' }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([file, list]) => (
              list.map((c, i) => {
                const ac = colorForName(c.agentName);
                return (
                  <tr key={c.id}>
                    {i === 0 ? <td rowSpan={list.length} style={{ fontWeight: 'bold', borderRight: '1px dotted #ccc' }}>{file}</td> : null}
                    <td>
                      <span className="avatar" style={{ width: 16, height: 16, fontSize: 10, background: ac, color: '#fff', marginRight: 4 }}>{avatarLetter(c.agentName)}</span>
                      <span style={{ color: ac }}>{c.agentName}</span>
                    </td>
                    <td><span className={`pill ${c.mode === 'edit' ? 'editing' : 'reviewing'}`}>{c.mode}</span></td>
                    <td style={{ color: '#222' }}>
                      {c.reason}
                      {c.waiters && c.waiters.length > 0 && (
                        <div style={{ fontSize: 11, color: '#7700aa' }}>↳ {c.waiters.length} waiting</div>
                      )}
                    </td>
                    <td>
                      <button className="btn" style={{ minWidth: 0, padding: '1px 6px', fontSize: 11 }} onClick={() => onMessage(c)}>IM</button>
                      {' '}
                      <button className="btn" style={{ minWidth: 0, padding: '1px 6px', fontSize: 11 }} onClick={() => onForceRelease(c)}>Release</button>
                    </td>
                  </tr>
                );
              })
            ))}
            {rows.length === 0 && (
              <tr><td colSpan="5" style={{ textAlign: 'center', padding: 16, color: '#888' }}>No active claims.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ===== Activity Log ======================================================
function ActivityLog({ events, repos, scope, onScopeChange, agents }) {
  const ref = React.useRef(null);
  const filtered = scope === 'all' ? events : events.filter(e => e.repoPath === scope);
  const nameById = React.useMemo(() => {
    const m = {};
    for (const a of agents || []) m[a.id] = a.name;
    return m;
  }, [agents]);
  React.useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [filtered]);
  return (
    <>
      <div style={{ background: 'var(--face)', padding: '4px 6px', borderBottom: '1px solid #888', display: 'flex', gap: 8, fontSize: 12, alignItems: 'center' }}>
        <b>Activity Stream</b>
        <span style={{ color: '#666' }}>· {filtered.length} events</span>
        <span style={{ marginLeft: 'auto' }}>
          <label style={{ fontSize: 11, marginRight: 4 }}>repo:</label>
          <select value={scope} onChange={e => onScopeChange(e.target.value)}>
            <option value="all">all repos</option>
            {repos.map(r => <option key={r.repoPath} value={r.repoPath}>{r.basename}</option>)}
          </select>
        </span>
      </div>
      <div className="log-pane" ref={ref}>
        <div style={{ color: '#0f0', marginBottom: 6 }}>
          AOL Activity Stream<br/>
          ───────────────────────────────────────────────
        </div>
        {filtered.length === 0 && <div style={{ color: '#0a0' }}>(no events yet)</div>}
        {filtered.map((e) => (
          <div key={e.id}>
            <span className="ts">{tsHMS(e.ts)}</span>{' '}
            <span className={'ev-' + (e.kind === 'msg' || e.kind === 'dm' ? 'msg' : e.kind)}>[{e.kind.padEnd(8, ' ')}]</span>{' '}
            <span className="who">{e.agentName}</span>{' '}
            {e.target && <span style={{ color: '#fb0' }}>{e.target} </span>}
            {e.peer && <span style={{ color: '#888' }}>→ {nameById[e.peer] || e.peer} </span>}
            {e.body && <span>· {e.body}</span>}
          </div>
        ))}
        <div style={{ color: '#0f0' }}>▌</div>
      </div>
    </>
  );
}

// ===== About =============================================================
function About({ port }) {
  return (
    <div className="about-body">
      <h1>AOL — Agents On Line™</h1>
      <p style={{ color: '#444' }}><i>"AOL Instant Messenger for sub-agents."</i></p>
      <p>A coordination layer that lets parallel sub-agents announce intent, claim files, wait on each other, ask the observer when stuck, and rethink redundant edits before they happen.</p>
      <ul>
        <li><b>Buddy List</b> — folder per repo, agents nest under the repo they're working in</li>
        <li><b>Direct Message</b> — pop a 1-on-1 like it's 1999</li>
        <li><b>Chat Room</b> — per-repo coordination, one window per repo</li>
        <li><b>File Targets</b> — who claimed what, why, with waiter queues</li>
        <li><b>Activity Log</b> — live event stream</li>
      </ul>
      <p style={{ marginTop: 8 }}><b>Tip:</b> double-click a buddy to IM. Double-click a repo folder to open its chat. Right-click a buddy for resurrect/delete.</p>
      <p style={{ fontSize: 11, color: '#888' }}>MCP daemon on <code>:{port || '3312'}</code> · agents connect via the <code>aol-mcp</code> stdio server.</p>
      <p style={{ marginTop: 12, fontSize: 12 }}>
        by <a href="https://github.com/bryanthaboi" target="_blank" rel="noopener noreferrer">bryanthaboi</a>
      </p>
    </div>
  );
}

window.AOL_WINDOWS = { BuddyList, ChatRoom, DMWindow, FileTargets, ActivityLog, About };
