/* global React */
const { AudioFx, Win, Icon, AolNet, STATUS_COLORS, colorForName, avatarLetter, basename, tsHM, tsHMS } = window.AOL_DATA;

// ===== Buddy List ========================================================
// Tree: top-level folder per repo, expand to show online agents.
function BuddyList({
  repos, agentsByRepo, selectedRepo, onSelectRepo,
  onOpenDM, onOpenAbout, onOpenChat, onOpenFiles, onOpenLog,
  signoff, observerName,
}) {
  const totalOnline = Object.values(agentsByRepo).flat().filter(a => a.status !== 'offline').length;
  return (
    <>
      <div className="buddy-header">
        <img src="agentsonlinelogo.png" className="small-logo" alt="" />
        <div className="you">
          <b>{observerName || 'observer'}</b>
          <span style={{ fontSize: 11, color: '#444' }}>
            {repos.length} repo{repos.length === 1 ? '' : 's'} · {totalOnline} agent{totalOnline === 1 ? '' : 's'} online
          </span>
        </div>
      </div>
      <div className="buddy-tabs">
        <div className="buddy-tab active">Buddies</div>
        <div className="buddy-tab" onClick={onOpenChat}>Chat</div>
        <div className="buddy-tab" onClick={onOpenFiles}>Files</div>
        <div className="buddy-tab" onClick={onOpenLog}>Log</div>
      </div>
      <div className="buddy-list">
        {repos.length === 0 && (
          <div style={{ padding: 12, fontSize: 12, color: '#666', fontStyle: 'italic' }}>
            No agents have registered yet. The buddy list groups agents into a folder per repo.
          </div>
        )}
        {repos.map((r) => (
          <RepoFolder key={r.repoPath}
            repo={r}
            agents={agentsByRepo[r.repoPath] || []}
            selected={selectedRepo === r.repoPath}
            onSelect={() => onSelectRepo(r.repoPath)}
            onOpenDM={onOpenDM}
          />
        ))}
      </div>
    </>
  );
}

function RepoFolder({ repo, agents, selected, onSelect, onOpenDM }) {
  const [open, setOpen] = React.useState(true);
  const online = agents.filter(a => a.status !== 'offline');
  const offline = agents.filter(a => a.status === 'offline');
  const visible = [...online, ...offline];
  const stop = (e) => e.stopPropagation();
  return (
    <>
      <div
        className="buddy-group"
        onClick={onSelect}
        onDoubleClick={(e) => { stop(e); setOpen(o => !o); }}
        title={'select repo: ' + repo.repoPath}
        style={{ background: selected ? '#bcd5f4' : undefined }}
      >
        <span className="caret" onClick={(e) => { stop(e); setOpen(o => !o); }}>{open ? '▼' : '▶'}</span>
        <span style={{ marginRight: 4 }}>{Icon.folder}</span>
        <span><b>{repo.basename}</b></span>
        <span className="count">({online.length}/{agents.length})</span>
      </div>
      {open && visible.map((a) => (
        <div
          key={a.id}
          className="buddy-row"
          onDoubleClick={() => onOpenDM(a)}
          title={a.reason || a.repoPath}
        >
          <span className="dot" style={{ background: STATUS_COLORS[a.status] || '#888' }}></span>
          <span className="name" style={{ color: a.color || colorForName(a.name) }}>{a.name}</span>
          {a.status === 'editing' && <span className="badge" style={{ background: '#ffe5b4' }}>edit</span>}
          {a.status === 'reviewing' && <span className="badge" style={{ background: '#d4f0ff' }}>read</span>}
          {a.status === 'waiting' && <span className="badge" style={{ background: '#f0d4ff' }}>wait</span>}
          {a.status === 'complete' && <span className="badge">done</span>}
          {a.status === 'idle' && <span className="badge" style={{ background: '#fffbcc' }}>idle</span>}
          {a.status === 'abandoned' && <span className="badge" style={{ background: '#eee' }}>abandon</span>}
          {a.currentFile && <span style={{ marginLeft: 4, fontSize: 10, color: '#555' }}>· {basename(a.currentFile)}</span>}
        </div>
      ))}
      {open && agents.length === 0 && (
        <div style={{ paddingLeft: 22, color: '#888', fontSize: 12, fontStyle: 'italic' }}>— nobody —</div>
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
          {repoPath ? repoPath : 'pick a repo from the buddy list'}
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
          <button className="btn" style={{ minWidth: 0, padding: '1px 6px', fontWeight: 'bold' }}>B</button>
          <button className="btn" style={{ minWidth: 0, padding: '1px 6px', fontStyle: 'italic' }}>I</button>
          <button className="btn" style={{ minWidth: 0, padding: '1px 6px', textDecoration: 'underline' }}>U</button>
          <span className="swatch" style={{ background: '#1a4ec8' }}></span>
          <span className="swatch" style={{ background: '#cc0000' }}></span>
          <span className="swatch" style={{ background: '#008000' }}></span>
          <span style={{ marginLeft: 'auto', fontSize: 10, color: '#666' }}>posting as {observerName}</span>
        </div>
        <div className="chat-input-row">
          <textarea
            className="chat-input inset"
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder={repoPath ? "post to this repo's room..." : "select a repo first"}
            disabled={!repoPath}
          />
          <div className="chat-send">
            <button className="btn" onClick={send} style={{ flex: 1 }} disabled={!repoPath || !text.trim()}>Send</button>
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
  const send = () => {
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
          <div key={m.id} style={{ marginBottom: 4 }}>
            {m.from === agent.id ? (
              <><span className="who-them" style={{ color: ac }}>{agent.name}:</span> {m.body}</>
            ) : (
              <><span className="who-you">{m.fromName || observerName}:</span> {m.body}</>
            )}
          </div>
        ))}
        {log.length === 0 && <div style={{ color: '#888', fontStyle: 'italic' }}>no messages yet</div>}
      </div>
      <textarea
        className="dm-input"
        value={text}
        onChange={e => setText(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
        placeholder={`message ${agent.name}...`}
      />
      <div style={{ padding: '0 4px 4px', display: 'flex', gap: 4 }}>
        <button className="btn">Warn</button>
        <button className="btn">Block</button>
        <button className="btn" style={{ marginLeft: 'auto' }} onClick={send}>Send</button>
      </div>
    </>
  );
}

// ===== File Targets =====================================================
function FileTargets({ claims, onMessage, onForceRelease }) {
  // group active claims by file
  const byFile = {};
  for (const c of claims) {
    if (!byFile[c.file]) byFile[c.file] = [];
    byFile[c.file].push(c);
  }
  const rows = Object.entries(byFile).sort();
  return (
    <>
      <div style={{ background: 'var(--face)', padding: '4px 6px', borderBottom: '1px solid #888', display: 'flex', gap: 8, fontSize: 12, alignItems: 'center' }}>
        <b>Active File Claims</b>
        <span style={{ color: '#666' }}>· {rows.length} file{rows.length === 1 ? '' : 's'} · {claims.length} claim{claims.length === 1 ? '' : 's'}</span>
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
              <tr><td colSpan="5" style={{ textAlign: 'center', padding: 16, color: '#888' }}>No active claims in this repo.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ===== Activity Log ======================================================
function ActivityLog({ events, repoPath }) {
  const ref = React.useRef(null);
  React.useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [events]);
  return (
    <div className="log-pane" ref={ref}>
      <div style={{ color: '#0f0', marginBottom: 6 }}>
        AOL Activity Stream {repoPath ? '— ' + basename(repoPath) : '(all repos)'}<br/>
        ───────────────────────────────────────────────
      </div>
      {events.length === 0 && <div style={{ color: '#0a0' }}>(no events yet)</div>}
      {events.map((e) => (
        <div key={e.id}>
          <span className="ts">{tsHMS(e.ts)}</span>{' '}
          <span className={'ev-' + (e.kind === 'msg' || e.kind === 'dm' ? 'msg' : e.kind)}>[{e.kind.padEnd(7, ' ')}]</span>{' '}
          <span className="who">{e.agentName}</span>{' '}
          {e.target && <span style={{ color: '#fb0' }}>{e.target} </span>}
          {e.peer && <span style={{ color: '#888' }}>→ {e.peer} </span>}
          {e.body && <span>· {e.body}</span>}
        </div>
      ))}
      <div style={{ color: '#0f0' }}>▌</div>
    </div>
  );
}

// ===== About =============================================================
function About({ port }) {
  return (
    <div className="about-body">
      <h1>AOL — Agents On Line™</h1>
      <p style={{ color: '#444' }}><i>"AOL Instant Messenger for sub-agents."</i></p>
      <p>A coordination layer that lets parallel sub-agents announce intent, claim files, wait on each other, and rethink redundant edits before they happen.</p>
      <ul>
        <li><b>Buddy List</b> — folder per repo, agents nest under the repo they're working in</li>
        <li><b>Direct Message</b> — pop a 1-on-1 like it's 1999</li>
        <li><b>Chat Room</b> — per-repo coordination so multiple repos run concurrently</li>
        <li><b>File Targets</b> — who claimed what, why, with waiter queues</li>
        <li><b>Activity Log</b> — live event stream for the selected repo</li>
      </ul>
      <p style={{ marginTop: 8 }}><b>Tip:</b> double-click a buddy to open an IM. Click a repo folder to scope the room/files/log.</p>
      <p style={{ fontSize: 11, color: '#888' }}>MCP daemon on <code>:{port || '3312'}</code> · agents connect via the <code>aol-mcp</code> stdio server.</p>
      <p style={{ marginTop: 12, fontSize: 12 }}>
        by <a href="https://github.com/bryanthaboi" target="_blank" rel="noopener noreferrer">bryanthaboi</a>
      </p>
    </div>
  );
}

window.AOL_WINDOWS = { BuddyList, ChatRoom, DMWindow, FileTargets, ActivityLog, About };
