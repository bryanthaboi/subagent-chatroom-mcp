/* global React, ReactDOM */
const { AGENTS, YOU, INITIAL_STATES, ROOM_SCRIPT, DM_SCRIPTS, AudioFx, Win, Icon } = window.AOL_DATA;
const { BuddyList, ChatRoom, DMWindow, FileTargets, ActivityLog, About } = window.AOL_WINDOWS;

const AGENT_COLORS = Object.fromEntries(AGENTS.map(a => [a.id, a.color]));

function nowTs() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}
function nowTsSec() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`;
}

// ===== Sign-on screen ====================================================
function SignOn({ onDone }) {
  const [stage, setStage] = React.useState('form'); // form -> connecting -> done
  const [progress, setProgress] = React.useState(0);
  const [text, setText] = React.useState('Initializing...');
  React.useEffect(() => {
    if (stage !== 'connecting') return;
    const stages = [
      'Initializing modem...',
      'Dialing MCP server...',
      'Negotiating protocol v4.0...',
      'Authenticating orchestrator...',
      'Loading buddy list...',
      'Welcome.',
    ];
    let i = 0;
    const t = setInterval(() => {
      i += 1;
      setProgress(Math.min(100, Math.round((i / stages.length) * 100)));
      setText(stages[Math.min(i, stages.length - 1)]);
      if (i >= stages.length) {
        clearInterval(t);
        AudioFx.signon();
        setTimeout(() => onDone(), 400);
      }
    }, 380);
    return () => clearInterval(t);
  }, [stage, onDone]);

  return (
    <div style={{ position: 'fixed', inset: 0, display: 'grid', placeItems: 'center', background: 'rgba(0,0,0,0.4)', zIndex: 99999 }}>
      <div className="win signon-window" style={{ position: 'relative' }}>
        <div className="win-titlebar">
          <span className="win-title-text">Sign On</span>
          <div className="win-btns"><button className="win-btn">×</button></div>
        </div>
        <div className="win-body">
          <div className="signon-body">
            <img src="agentsonlinelogo.png" className="signon-logo" alt="Agents Online" />
            {stage === 'form' && (
              <>
                <div className="signon-row">
                  <label>Screen Name:</label>
                  <select defaultValue="orchestrator">
                    <option>orchestrator</option>
                    <option>orchestrator-staging</option>
                    <option>guest</option>
                  </select>
                </div>
                <div className="signon-row">
                  <label>Password:</label>
                  <input type="password" defaultValue="••••••••••" />
                </div>
                <div className="signon-row">
                  <label>Location:</label>
                  <select defaultValue="local">
                    <option>local</option>
                    <option>mcp://prod</option>
                    <option>mcp://staging</option>
                  </select>
                </div>
                <div style={{ alignSelf: 'flex-start', fontSize: 11, marginTop: 4 }}>
                  <label><input type="checkbox" defaultChecked /> Save password</label>{' '}
                  <label><input type="checkbox" defaultChecked /> Auto-claim file intent</label>
                </div>
                <div className="signon-actions">
                  <button className="btn" onClick={() => { setStage('connecting'); }}>Sign On</button>
                  <button className="btn">Setup</button>
                  <button className="btn">Help</button>
                </div>
              </>
            )}
            {stage === 'connecting' && (
              <>
                <div className="signon-stage">{text}</div>
                <div className="signon-progress" style={{ width: 280 }}>
                  <div className="bar" style={{ width: progress + '%' }}></div>
                </div>
                <div style={{ fontSize: 11, color: '#666' }}>connecting at 56,000 bps</div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ===== App ===============================================================
function App() {
  const [signedOn, setSignedOn] = React.useState(false);
  const [states, setStates] = React.useState(INITIAL_STATES);
  const [chat, setChat] = React.useState([
    { kind: 'sys', ts: '09:01', text: 'topic set: keep claims tight, prefer wait over duplicate edits' },
    { kind: 'sys', ts: '09:02', text: 'orchestrator joined the room' },
  ]);
  const [dms, setDms] = React.useState({});       // id -> [{who, text}]
  const [openDMs, setOpenDMs] = React.useState([]); // [agentId]
  const [events, setEvents] = React.useState([]);
  const [windows, setWindows] = React.useState({
    buddies: { open: true, x: 24, y: 56, w: 280, h: 460, z: 5, title: 'Buddy List', icon: Icon.buddies },
    chat:    { open: true, x: 340, y: 56, w: 540, h: 380, z: 4, title: 'Chat Room — #general-coordination', icon: Icon.chat },
    files:   { open: true, x: 340, y: 460, w: 720, h: 280, z: 3, title: 'File Targets', icon: Icon.files },
    log:     { open: false, x: 900, y: 60, w: 460, h: 360, z: 2, title: 'Activity Log', icon: Icon.log },
    about:   { open: false, x: 200, y: 200, w: 400, h: 360, z: 6, title: 'About AOL', icon: Icon.about },
  });
  const [zCounter, setZCounter] = React.useState(10);
  const [activeWin, setActiveWin] = React.useState('buddies');
  const [chatterSpeed, setChatterSpeed] = React.useState(1);  // multiplier
  const [soundsOn, setSoundsOn] = React.useState(true);
  const [showTweaks, setShowTweaks] = React.useState(false);

  React.useEffect(() => { AudioFx.setEnabled(soundsOn); }, [soundsOn]);

  // ---- helpers
  const addEvent = React.useCallback((kind, who, text) => {
    setEvents(es => [...es, { ts: nowTsSec(), kind, who, text }].slice(-200));
  }, []);
  const addRoom = React.useCallback((line) => {
    setChat(cs => [...cs, line].slice(-300));
  }, []);
  const addDM = React.useCallback((agentId, msg) => {
    setDms(d => ({ ...d, [agentId]: [...(d[agentId] || []), msg] }));
  }, []);

  const openWin = (key) => {
    setWindows(w => ({ ...w, [key]: { ...w[key], open: true } }));
    setActiveWin(key);
    setZCounter(z => z + 1);
    setWindows(w => ({ ...w, [key]: { ...w[key], open: true, z: zCounter + 1 } }));
  };
  const closeWin = (key) => setWindows(w => ({ ...w, [key]: { ...w[key], open: false } }));
  const activateWin = (key) => {
    setActiveWin(key);
    setZCounter(z => z + 1);
    setWindows(w => ({ ...w, [key]: { ...w[key], z: zCounter + 1 } }));
  };

  const openDM = (agent) => {
    if (!openDMs.includes(agent.id)) {
      setOpenDMs(d => [...d, agent.id]);
      // seed canned exchange if any
      if (!dms[agent.id]) {
        const seed = (DM_SCRIPTS[agent.id] || []).slice(0, 1);
        setDms(d => ({ ...d, [agent.id]: seed }));
      }
      AudioFx.knock();
      addEvent('msg', agent.name, '→ orchestrator (IM opened)');
    }
    setActiveWin('dm:' + agent.id);
    setZCounter(z => z + 1);
  };
  const closeDM = (agentId) => setOpenDMs(d => d.filter(id => id !== agentId));

  const sendDM = (agentId, text) => {
    addDM(agentId, { who: 'you', text });
    AudioFx.msg();
    addEvent('msg', YOU.name, `→ ${agentId}: "${text.slice(0, 40)}${text.length > 40 ? '…' : ''}"`);
    // canned reply
    const script = DM_SCRIPTS[agentId];
    const cur = (dms[agentId] || []).length + 1;
    const next = script && script[cur];
    if (next && next.who !== 'you') {
      setTimeout(() => {
        addDM(agentId, next);
        AudioFx.msg();
      }, 900 + Math.random() * 800);
    } else {
      // generic ack
      setTimeout(() => {
        const acks = ['ack 👍', 'noted, ty', 'on it', '👀', 'roger', 'word'];
        addDM(agentId, { who: agentId, text: acks[Math.floor(Math.random() * acks.length)] });
        AudioFx.msg();
      }, 1100);
    }
  };

  const sendRoom = (text) => {
    addRoom({ ts: nowTs(), who: YOU.name, text, color: YOU.color });
    AudioFx.room();
    addEvent('msg', YOU.name, `#room: "${text.slice(0,40)}"`);
  };

  // ---- chatter loop (canned messages with realistic state effects) ----
  const scriptIdx = React.useRef(0);
  React.useEffect(() => {
    if (!signedOn) return;
    let stopped = false;
    const tick = () => {
      if (stopped) return;
      const i = scriptIdx.current;
      if (i >= ROOM_SCRIPT.length) return; // done
      const m = ROOM_SCRIPT[i];
      addRoom({ ts: nowTs(), who: m.who, text: m.text, color: AGENT_COLORS[m.who] });
      AudioFx.room();
      addEvent('msg', m.who, `#room: "${m.text.slice(0,40)}…"`);
      scriptIdx.current = i + 1;
      const delay = (4500 + Math.random() * 3500) / chatterSpeed;
      setTimeout(tick, delay);
    };
    const first = setTimeout(tick, 1800 / chatterSpeed);
    return () => { stopped = true; clearTimeout(first); };
  }, [signedOn, chatterSpeed, addRoom, addEvent]);

  // ---- state evolution (agents progress through lifecycle) ----
  React.useEffect(() => {
    if (!signedOn) return;
    const transitions = [
      // (delay, fn)
      [6000, () => {
        setStates(s => ({ ...s, cache_cal: { status: 'online', file: null, reason: null } }));
        AudioFx.signon();
        addEvent('online', 'cache_cal', 'signed on (door creak.wav)');
        addRoom({ kind: 'sys', ts: nowTs(), text: 'cache_cal entered the room' });
      }],
      [10000, () => {
        setStates(s => ({ ...s, cache_cal: { status: 'reviewing', file: 'lib/cache/redis.ts', reason: 'auditing TTL settings' } }));
        addEvent('claim', 'cache_cal', 'claim lib/cache/redis.ts (review)');
      }],
      [16000, () => {
        setStates(s => ({ ...s, pixel_pat: { status: 'complete', file: 'src/dashboard.tsx', reason: 'category selector + spacing fixed' } }));
        AudioFx.workDone();
        addEvent('release', 'pixel_pat', 'completed src/dashboard.tsx');
      }],
      [18500, () => {
        setStates(s => ({ ...s, dashboard_dee: { status: 'reviewing', file: 'src/dashboard.tsx', reason: 're-reading after pixel_pat' } }));
        AudioFx.waitResolved();
        addEvent('claim', 'dashboard_dee', 're-reading src/dashboard.tsx (post-merge)');
      }],
      [22000, () => {
        setStates(s => ({ ...s, dashboard_dee: { status: 'idle', file: null, reason: 'edit no longer necessary' } }));
        addEvent('release', 'dashboard_dee', 'dropped planned edit (already covered)');
      }],
      [26000, () => {
        setStates(s => ({ ...s, schema_sam: { status: 'editing', file: 'db/migrations/0042.sql', reason: 'reorder backfill steps' } }));
        AudioFx.workStart();
        addEvent('claim', 'schema_sam', 'editing db/migrations/0042.sql');
      }],
      [32000, () => {
        setStates(s => ({ ...s, lint_lloyd: { status: 'reviewing', file: 'src/dashboard.tsx', reason: 'janitor pass after pixel_pat' } }));
        addEvent('claim', 'lint_lloyd', 'reviewing src/dashboard.tsx');
      }],
      [38000, () => {
        setStates(s => ({ ...s, router_rabbit: { status: 'complete', file: 'app/router.ts', reason: 'redirect table extracted' } }));
        AudioFx.workDone();
        addEvent('release', 'router_rabbit', 'completed app/router.ts');
      }],
    ];
    const timers = transitions.map(([d, fn]) => setTimeout(fn, d / chatterSpeed));
    return () => timers.forEach(clearTimeout);
  }, [signedOn, chatterSpeed, addEvent, addRoom]);

  if (!signedOn) {
    return <SignOn onDone={() => setSignedOn(true)} />;
  }

  return (
    <>
      <div className="desktop">
        {/* Desktop icons */}
        <div className="desk-icon" style={{ left: 16, top: 16 }} onDoubleClick={() => openWin('buddies')}>
          <div className="icon-img" style={{ background: '#ffd700', border: '2px solid #000', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28 }}>🏃</div>
          Buddy List
        </div>
        <div className="desk-icon" style={{ left: 16, top: 110 }} onDoubleClick={() => openWin('chat')}>
          <div className="icon-img" style={{ background: '#fff', border: '2px solid #000', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28 }}>💬</div>
          Chat Room
        </div>
        <div className="desk-icon" style={{ left: 16, top: 204 }} onDoubleClick={() => openWin('files')}>
          <div className="icon-img" style={{ background: '#fff', border: '2px solid #000', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>📁</div>
          File Targets
        </div>
        <div className="desk-icon" style={{ left: 16, top: 298 }} onDoubleClick={() => openWin('log')}>
          <div className="icon-img" style={{ background: '#000', border: '2px solid #000', color: '#0f0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--pixel)', fontSize: 14 }}>{'>_'}</div>
          Activity
        </div>
        <div className="desk-icon" style={{ left: 16, top: 392 }} onDoubleClick={() => openWin('about')}>
          <div className="icon-img" style={{ background: '#0000a0', border: '2px solid #000', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontStyle: 'italic', fontWeight: 'bold' }}>i</div>
          About AOL
        </div>

        {/* Windows */}
        {windows.buddies.open && (
          <div style={{ zIndex: windows.buddies.z, position: 'absolute' }}>
            <Win id="buddies" title={windows.buddies.title} icon={Icon.buddies}
                 x={windows.buddies.x} y={windows.buddies.y} w={windows.buddies.w} h={windows.buddies.h}
                 active={activeWin === 'buddies'} onActivate={activateWin} onClose={closeWin}
                 minSize={{ w: 240, h: 320 }}>
              <BuddyList
                states={states}
                onOpenDM={openDM}
                onOpenChat={() => openWin('chat')}
                onOpenFiles={() => openWin('files')}
                onOpenLog={() => openWin('log')}
                onOpenAbout={() => openWin('about')}
                signoff={() => { AudioFx.signoff(); setTimeout(() => setSignedOn(false), 600); }}
              />
            </Win>
          </div>
        )}
        {windows.chat.open && (
          <div style={{ zIndex: windows.chat.z, position: 'absolute' }}>
            <Win id="chat" title={windows.chat.title} icon={Icon.chat}
                 x={windows.chat.x} y={windows.chat.y} w={windows.chat.w} h={windows.chat.h}
                 active={activeWin === 'chat'} onActivate={activateWin} onClose={closeWin}
                 minSize={{ w: 360, h: 280 }}>
              <ChatRoom messages={chat} onSend={sendRoom} states={states} />
            </Win>
          </div>
        )}
        {windows.files.open && (
          <div style={{ zIndex: windows.files.z, position: 'absolute' }}>
            <Win id="files" title={windows.files.title} icon={Icon.files}
                 x={windows.files.x} y={windows.files.y} w={windows.files.w} h={windows.files.h}
                 active={activeWin === 'files'} onActivate={activateWin} onClose={closeWin}
                 minSize={{ w: 480, h: 200 }}>
              <FileTargets
                states={states}
                onMessage={openDM}
                onRelease={(id) => {
                  setStates(s => ({ ...s, [id]: { ...s[id], status: 'idle', file: null, reason: null } }));
                  addEvent('release', id, 'orchestrator forced release');
                }}
              />
            </Win>
          </div>
        )}
        {windows.log.open && (
          <div style={{ zIndex: windows.log.z, position: 'absolute' }}>
            <Win id="log" title={windows.log.title} icon={Icon.log}
                 x={windows.log.x} y={windows.log.y} w={windows.log.w} h={windows.log.h}
                 active={activeWin === 'log'} onActivate={activateWin} onClose={closeWin}
                 minSize={{ w: 360, h: 240 }}>
              <ActivityLog events={events} />
            </Win>
          </div>
        )}
        {windows.about.open && (
          <div style={{ zIndex: windows.about.z, position: 'absolute' }}>
            <Win id="about" title={windows.about.title} icon={Icon.about}
                 x={windows.about.x} y={windows.about.y} w={windows.about.w} h={windows.about.h}
                 active={activeWin === 'about'} onActivate={activateWin} onClose={closeWin}
                 resizable={false}>
              <About />
            </Win>
          </div>
        )}

        {/* DM popup windows */}
        {openDMs.map((id, i) => {
          const agent = AGENTS.find(a => a.id === id);
          if (!agent) return null;
          return (
            <div key={id} style={{ zIndex: 100 + i, position: 'absolute' }}>
              <Win id={'dm:' + id} title={`IM with ${agent.name}`} icon={Icon.dm}
                   x={420 + i * 30} y={140 + i * 30} w={340} h={280}
                   active={activeWin === 'dm:' + id} onActivate={activateWin} onClose={() => closeDM(id)}
                   minSize={{ w: 260, h: 200 }}>
                <DMWindow agent={agent} log={dms[id] || []} onSend={sendDM} />
              </Win>
            </div>
          );
        })}

        {showTweaks && (
          <div className="win tweaks">
            <div className="win-titlebar">
              <span className="win-title-text">Tweaks</span>
              <div className="win-btns"><button className="win-btn" onClick={() => setShowTweaks(false)}>×</button></div>
            </div>
            <div className="win-body tweaks-body">
              <div className="tweaks-row">
                <label>Sounds</label>
                <input type="checkbox" checked={soundsOn} onChange={e => setSoundsOn(e.target.checked)} />
              </div>
              <div className="tweaks-row">
                <label>Chatter speed</label>
                <input type="range" min="0.5" max="4" step="0.5" value={chatterSpeed} onChange={e => setChatterSpeed(parseFloat(e.target.value))} />
                <span style={{ width: 30, textAlign: 'right' }}>{chatterSpeed}×</span>
              </div>
              <div className="tweaks-row">
                <button className="btn" onClick={() => { AudioFx.signon(); }}>Test sign-on</button>
                <button className="btn" onClick={() => { AudioFx.knock(); }}>IM ping</button>
              </div>
              <div style={{ fontSize: 11, color: '#444', marginTop: 6 }}>
                Drag any titlebar to move. Resize from the bottom-right corner. Double-click a buddy to IM.
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="hint">tip: double-click a buddy to open an IM · drag titlebars to move</div>

      {/* Taskbar */}
      <div className="taskbar">
        <button className="btn start-btn">
          <span className="start-logo"></span>
          Start
        </button>
        <div style={{ width: 1, height: 22, background: '#888', margin: '0 4px' }}></div>
        <div className="task-items">
          {Object.entries(windows).filter(([,w]) => w.open).map(([key, w]) => (
            <div key={key}
                 className={'task-item ' + (activeWin === key ? 'active' : '')}
                 onClick={() => activateWin(key)}>
              <span style={{ width: 16, height: 16, display: 'inline-block' }}>{w.icon}</span>
              <span className="ti-name">{w.title}</span>
            </div>
          ))}
          {openDMs.map(id => {
            const agent = AGENTS.find(a => a.id === id);
            if (!agent) return null;
            const k = 'dm:' + id;
            return (
              <div key={k}
                   className={'task-item ' + (activeWin === k ? 'active' : '')}
                   onClick={() => activateWin(k)}>
                <span style={{ width: 16, height: 16, display: 'inline-block' }}>{Icon.dm}</span>
                <span className="ti-name">{agent.name}</span>
              </div>
            );
          })}
        </div>
        <div className="tray">
          <span title="sounds" style={{ cursor: 'pointer' }} onClick={() => setSoundsOn(s => !s)}>{soundsOn ? '🔊' : '🔈'}</span>
          <span title="tweaks" style={{ cursor: 'pointer' }} onClick={() => setShowTweaks(s => !s)}>⚙</span>
          <span>{nowTs()}</span>
        </div>
      </div>
    </>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
