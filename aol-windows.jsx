/* global React */
const { AGENTS, YOU, ROOM_SCRIPT, DM_SCRIPTS, AudioFx, Win, Icon } = window.AOL_DATA;

// ===== Buddy List ========================================================
function BuddyList({ states, onOpenDM, onOpenAbout, onOpenChat, onOpenFiles, onOpenLog, signoff }) {
  const groups = {
    'Active Agents': AGENTS.filter(a => ['editing','reviewing','waiting'].includes(states[a.id]?.status)),
    'Online & Idle': AGENTS.filter(a => ['online','idle','complete'].includes(states[a.id]?.status)),
    'Offline':       AGENTS.filter(a => states[a.id]?.status === 'offline'),
  };

  return (
    <>
      <div className="buddy-header">
        <img src="agentsonlinelogo.png" className="small-logo" alt="" />
        <div className="you">
          <b>{YOU.name}</b>
          <span style={{ fontSize: 11, color: '#444' }}>signed on · 9 buddies</span>
        </div>
      </div>
      <div className="buddy-tabs">
        <div className="buddy-tab active">Buddies</div>
        <div className="buddy-tab" onClick={onOpenChat}>Chat</div>
        <div className="buddy-tab" onClick={onOpenFiles}>Files</div>
        <div className="buddy-tab" onClick={onOpenLog}>Log</div>
      </div>
      <div className="buddy-list">
        {Object.entries(groups).map(([gname, list]) => (
          <Group key={gname} name={gname} count={list.length} list={list} states={states} onOpenDM={onOpenDM} />
        ))}
      </div>
      <div className="buddy-footer">
        <button className="btn" onClick={onOpenChat}>Chat Room</button>
        <button className="btn" onClick={onOpenFiles}>File Targets</button>
        <button className="btn" onClick={onOpenAbout}>Setup</button>
        <button className="btn" style={{ marginLeft: 'auto' }} onClick={signoff}>Sign Off</button>
      </div>
    </>
  );
}

function Group({ name, count, list, states, onOpenDM }) {
  const [open, setOpen] = React.useState(true);
  return (
    <>
      <div className="buddy-group" onClick={() => setOpen(o => !o)}>
        <span className="caret">{open ? '▼' : '▶'}</span>
        <span>{name}</span>
        <span className="count">({list.length}/{list.length})</span>
      </div>
      {open && list.map(a => {
        const st = states[a.id] || {};
        return (
          <div key={a.id} className="buddy-row" onDoubleClick={() => onOpenDM(a)} title={st.reason || a.tagline}>
            <span className={`dot ${st.status}`}></span>
            <span className="name">{a.name}</span>
            {st.status === 'editing' && <span className="badge" style={{ background: '#ffe5b4' }}>edit</span>}
            {st.status === 'waiting' && <span className="badge" style={{ background: '#f0d4ff' }}>wait</span>}
            {st.status === 'reviewing' && <span className="badge" style={{ background: '#d4f0ff' }}>read</span>}
            {st.status === 'complete' && <span className="badge">done</span>}
            {st.status === 'idle' && <span className="badge" style={{ background: '#fffbcc' }}>idle</span>}
          </div>
        );
      })}
      {list.length === 0 && <div style={{ paddingLeft: 22, color: '#888', fontSize: 12, fontStyle: 'italic' }}>— nobody —</div>}
    </>
  );
}

// ===== Chatroom ==========================================================
function ChatRoom({ messages, onSend, states }) {
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

  const onlineCount = AGENTS.filter(a => states[a.id]?.status !== 'offline').length;

  return (
    <>
      <div className="chat-toolbar">
        <span style={{ fontWeight: 'bold' }}>#general-coordination</span>
        <span style={{ color: '#666' }}>· {onlineCount + 1} in room</span>
        <span style={{ marginLeft: 'auto', fontSize: 11, color: '#666' }}>topic: don't karate-chop the same file</span>
      </div>
      <div className="chat-log inset" ref={logRef} style={{ margin: 2 }}>
        {messages.map((m, i) => (
          <div key={i} className="line">
            <span className="ts">[{m.ts}]</span>
            {m.kind === 'sys' ? (
              <span className="sys">— {m.text}</span>
            ) : (
              <>
                <span className="who" style={{ color: m.color || '#000' }}>{m.who}:</span>{' '}
                <span>{m.text}</span>
              </>
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
          <span style={{ marginLeft: 'auto', fontSize: 10, color: '#666' }}>Comic Sans MS · 14pt</span>
        </div>
        <div className="chat-input-row">
          <textarea
            className="chat-input inset"
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder="say something to the room..."
          />
          <div className="chat-send">
            <button className="btn" onClick={send} style={{ flex: 1 }}>Send</button>
            <button className="btn" onClick={() => setText(t => t + ' 🙂')}>:-)</button>
          </div>
        </div>
      </div>
    </>
  );
}

// ===== DM Window =========================================================
function DMWindow({ agent, log, onSend }) {
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

  return (
    <>
      <div style={{ background: '#fff', borderBottom: '1px solid #888', padding: '4px 6px', fontSize: 11, display: 'flex', alignItems: 'center', gap: 6 }}>
        <span className="avatar" style={{ width: 18, height: 18, fontSize: 11, background: agent.color, color: '#fff' }}>{agent.avatar}</span>
        <b>{agent.name}</b>
        <span style={{ color: '#666' }}>· {agent.tagline}</span>
      </div>
      <div className="dm-log inset" ref={ref} style={{ margin: 2 }}>
        {log.map((m, i) => (
          <div key={i} style={{ marginBottom: 4 }}>
            {m.who === 'you' ? (
              <><span className="who-you">{YOU.name}:</span> {m.text}</>
            ) : (
              <><span className="who-them" style={{ color: agent.color }}>{agent.name}:</span> {m.text}</>
            )}
          </div>
        ))}
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
function FileTargets({ states, onMessage, onRelease }) {
  // build claim map
  const claims = {};
  AGENTS.forEach(a => {
    const st = states[a.id]; if (!st || !st.file) return;
    claims[st.file] = claims[st.file] || [];
    claims[st.file].push({ agent: a, status: st.status, reason: st.reason, waitingOn: st.waitingOn });
  });
  const rows = Object.entries(claims).sort();

  return (
    <>
      <div style={{ background: 'var(--face)', padding: '4px 6px', borderBottom: '1px solid #888', display: 'flex', gap: 8, fontSize: 12, alignItems: 'center' }}>
        <b>Active File Claims</b>
        <span style={{ color: '#666' }}>· {rows.length} files · {Object.values(claims).flat().length} claims</span>
        <button className="btn" style={{ marginLeft: 'auto' }} onClick={() => {}}>Refresh</button>
      </div>
      <div className="files-tbl inset" style={{ margin: 2 }}>
        <table>
          <thead>
            <tr>
              <th style={{ width: '28%' }}>File</th>
              <th style={{ width: '18%' }}>Holder</th>
              <th style={{ width: '12%' }}>Status</th>
              <th>Reason</th>
              <th style={{ width: '14%' }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([file, list]) => (
              list.map((c, i) => (
                <tr key={file + i}>
                  {i === 0 ? <td rowSpan={list.length} style={{ fontWeight: 'bold', borderRight: '1px dotted #ccc' }}>{file}</td> : null}
                  <td>
                    <span className="avatar" style={{ width: 16, height: 16, fontSize: 10, background: c.agent.color, color: '#fff', marginRight: 4 }}>{c.agent.avatar}</span>
                    {c.agent.name}
                  </td>
                  <td><span className={`pill ${c.status}`}>{c.status}</span></td>
                  <td style={{ color: '#222' }}>
                    {c.reason}
                    {c.waitingOn && <div style={{ fontSize: 11, color: '#7700aa' }}>↳ waiting on {c.waitingOn}</div>}
                  </td>
                  <td>
                    <button className="btn" style={{ minWidth: 0, padding: '1px 6px', fontSize: 11 }} onClick={() => onMessage(c.agent)}>IM</button>
                    {' '}
                    <button className="btn" style={{ minWidth: 0, padding: '1px 6px', fontSize: 11 }} onClick={() => onRelease(c.agent.id)}>Release</button>
                  </td>
                </tr>
              ))
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
function ActivityLog({ events }) {
  const ref = React.useRef(null);
  React.useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [events]);
  return (
    <div className="log-pane" ref={ref}>
      <div style={{ color: '#0f0', marginBottom: 6 }}>
        AOL Activity Stream — tail -f /var/log/agents-online<br/>
        ───────────────────────────────────────────────
      </div>
      {events.map((e, i) => (
        <div key={i}>
          <span className="ts">{e.ts}</span>{' '}
          <span className={'ev-' + e.kind}>[{e.kind.padEnd(7, ' ')}]</span>{' '}
          <span className="who">{e.who}</span>{' '}
          <span>{e.text}</span>
        </div>
      ))}
      <div style={{ color: '#0f0' }}>▌</div>
    </div>
  );
}

// ===== About =============================================================
function About() {
  return (
    <div className="about-body">
      <h1>AOL — Agents On Line™</h1>
      <p style={{ color: '#444' }}><i>"AOL Instant Messenger for sub-agents."</i></p>
      <p>A lightweight coordination layer that lets parallel sub-agents announce intent, claim files, wait on each other, and rethink redundant edits before they happen.</p>
      <ul>
        <li><b>Buddy List</b> — see who's online, idle, editing, waiting, or done</li>
        <li><b>Direct Message</b> — pop a 1-on-1 like it's 1999</li>
        <li><b>Chat Room</b> — broader coordination for the whole swarm</li>
        <li><b>File Targets</b> — who claimed what, why, and who's queued</li>
        <li><b>Activity Log</b> — sign-ons, claims, completions, in green-on-black</li>
      </ul>
      <p style={{ marginTop: 8 }}><b>Tip:</b> double-click a buddy to open an IM.</p>
      <p style={{ fontSize: 11, color: '#888' }}>Build 4.0 · MCP server pretend-running on <code>:7331</code></p>
    </div>
  );
}

window.AOL_WINDOWS = { BuddyList, ChatRoom, DMWindow, FileTargets, ActivityLog, About };
