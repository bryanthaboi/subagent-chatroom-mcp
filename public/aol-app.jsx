/* global React, ReactDOM */
const { AudioFx, Win, Icon, AolNet, STATUS_COLORS, colorForName, avatarLetter, basename, tsHM, tsHMS } = window.AOL_DATA;
const { BuddyList, ChatRoom, DMWindow, FileTargets, ActivityLog, About } = window.AOL_WINDOWS;

function nowTs() {
  const d = new Date();
  return String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0');
}

// ===== Sign-on screen ====================================================
function SignOn({ onDone }) {
  const [name, setName] = React.useState(localStorage.getItem('aol.observerName') || 'observer');
  const [repos, setRepos] = React.useState([]);
  const [selectedRepo, setSelectedRepo] = React.useState(localStorage.getItem('aol.repoPath') || '');
  const [stage, setStage] = React.useState('form');
  const [progress, setProgress] = React.useState(0);
  const [text, setText] = React.useState('Initializing...');
  const [error, setError] = React.useState(null);

  React.useEffect(() => {
    AolNet.listRepos().then((r) => setRepos(r.repos || [])).catch((e) => setError(e.message));
  }, []);

  React.useEffect(() => {
    if (stage !== 'connecting') return;
    const audio = new Audio('connect.mp3');
    audio.play().catch(() => {});
    const stages = [
      'Initializing modem...',
      'Dialing daemon at :3312...',
      'Negotiating MCP protocol...',
      'Subscribing to event stream...',
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
        setTimeout(() => {
          localStorage.setItem('aol.observerName', name);
          localStorage.setItem('aol.repoPath', selectedRepo);
          onDone({ name, repoPath: selectedRepo || null });
        }, 1700);
      }
    }, 280);
    return () => {
      clearInterval(t);
      try { audio.pause(); audio.currentTime = 0; } catch (e) {}
    };
  }, [stage, onDone, name, selectedRepo]);

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
                  <input
                    type="text"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="observer"
                  />
                </div>
                <div className="signon-row">
                  <label>Repo:</label>
                  <select value={selectedRepo} onChange={e => setSelectedRepo(e.target.value)}>
                    <option value="">— all repos —</option>
                    {repos.map(r => <option key={r.repoPath} value={r.repoPath}>{r.basename} ({r.agentCount})</option>)}
                  </select>
                </div>
                <div style={{ alignSelf: 'flex-start', fontSize: 11, marginTop: 4, color: '#444' }}>
                  Pick a repo to scope your view, or leave blank to see all repos. The buddy list always shows a folder per repo.
                </div>
                {error && <div style={{ color: '#a00', fontSize: 11 }}>error: {error}</div>}
                <div className="signon-actions">
                  <button className="btn" onClick={() => { if (name.trim()) setStage('connecting'); }}>Sign On</button>
                  <button className="btn" onClick={() => AolNet.listRepos().then(r => setRepos(r.repos || []))}>Refresh</button>
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
  const [observer, setObserver] = React.useState({ name: 'observer', repoPath: null });

  // Server-sourced state
  const [repos, setRepos] = React.useState([]);
  const [agents, setAgents] = React.useState([]);            // all agents from server
  const [claims, setClaims] = React.useState([]);            // active claims
  const [messages, setMessages] = React.useState([]);        // room messages for selected repo
  const [activity, setActivity] = React.useState([]);        // activity for selected repo
  const [dms, setDms] = React.useState({});                  // {agentId: [Message]}

  const [selectedRepo, setSelectedRepo] = React.useState(null);
  const [openDMs, setOpenDMs] = React.useState([]);          // [agentId]
  const [windows, setWindows] = React.useState({
    buddies: { open: true, x: 24, y: 56, w: 300, h: 460, z: 5, title: 'Buddy List', icon: Icon.buddies },
    chat:    { open: true, x: 360, y: 56, w: 540, h: 380, z: 4, title: 'Chat Room', icon: Icon.chat },
    files:   { open: true, x: 360, y: 460, w: 720, h: 280, z: 3, title: 'File Targets', icon: Icon.files },
    log:     { open: false, x: 920, y: 60, w: 460, h: 360, z: 2, title: 'Activity Log', icon: Icon.log },
    about:   { open: false, x: 220, y: 120, w: 460, h: 540, z: 6, title: 'About AOL', icon: Icon.about },
  });
  const [zCounter, setZCounter] = React.useState(10);
  const [activeWin, setActiveWin] = React.useState('buddies');
  const [soundsOn, setSoundsOn] = React.useState(true);
  const [showTweaks, setShowTweaks] = React.useState(false);
  const [errorBanner, setErrorBanner] = React.useState(null);

  React.useEffect(() => { AudioFx.setEnabled(soundsOn); }, [soundsOn]);

  // play welcome.wav once, when the buddy list first renders post-connect
  const welcomedRef = React.useRef(false);
  React.useEffect(() => {
    if (signedOn && !welcomedRef.current) {
      welcomedRef.current = true;
      AudioFx.welcome();
    }
    if (!signedOn) welcomedRef.current = false;
  }, [signedOn]);

  // --- helpers ----------------------------------------------------------
  const upsertAgent = React.useCallback((agent) => {
    setAgents((list) => {
      const i = list.findIndex(a => a.id === agent.id);
      if (i === -1) return [...list, agent];
      const copy = list.slice();
      copy[i] = agent;
      return copy;
    });
  }, []);

  const upsertClaim = React.useCallback((claim) => {
    setClaims((list) => {
      const i = list.findIndex(c => c.id === claim.id);
      if (i === -1) {
        if (claim.status === 'active') return [claim, ...list];
        return list;
      }
      // update or remove if released
      if (claim.status !== 'active') {
        const copy = list.slice();
        copy.splice(i, 1);
        return copy;
      }
      const copy = list.slice();
      copy[i] = claim;
      return copy;
    });
  }, []);

  const handleMessage = React.useCallback((message) => {
    const fromSelf = observer.id && message.from === observer.id;
    if (message.to === null) {
      // room message
      if (!selectedRepo || message.repoPath === selectedRepo || !selectedRepo) {
        setMessages((m) => [...m, message]);
        if (!fromSelf) AudioFx.imRecv();
      }
    } else {
      // dm — file under the OTHER party id
      const peerId = message.to;
      setDms((d) => ({ ...d, [peerId]: [...(d[peerId] || []), message] }));
      if (!fromSelf) AudioFx.imRecv();
    }
  }, [selectedRepo, observer.id]);

  const handleActivity = React.useCallback((event) => {
    if (selectedRepo && event.repoPath !== selectedRepo) return;
    setActivity((es) => [...es, event].slice(-300));
    if (event.kind === 'online') AudioFx.signon();
    if (event.kind === 'offline') AudioFx.signoff();
    if (event.kind === 'claim') AudioFx.workStart();
    if (event.kind === 'release') AudioFx.workDone();
    if (event.kind === 'complete') AudioFx.workDone();
  }, [selectedRepo]);

  // --- initial load + SSE subscription ---------------------------------
  React.useEffect(() => {
    if (!signedOn) return;
    let unsub;
    (async () => {
      try {
        const [r1, a1, c1, m1, ev1] = await Promise.all([
          AolNet.listRepos(),
          AolNet.listAgents(),
          AolNet.listClaims(selectedRepo, true),
          selectedRepo ? AolNet.getMessages({ repoPath: selectedRepo }) : Promise.resolve({ messages: [] }),
          selectedRepo ? AolNet.getActivity({ repoPath: selectedRepo, limit: 200 }) : AolNet.getActivity({ limit: 200 }),
        ]);
        setRepos(r1.repos || []);
        setAgents(a1.agents || []);
        setClaims(c1.claims || []);
        setMessages(m1.messages || []);
        setActivity(ev1.events || []);
      } catch (e) {
        setErrorBanner('failed to load: ' + e.message);
      }
      unsub = AolNet.subscribe(selectedRepo || undefined, (ev) => {
        if (ev.type === 'agent') upsertAgent(ev.agent);
        else if (ev.type === 'claim') upsertClaim(ev.claim);
        else if (ev.type === 'release') upsertClaim(ev.claim);
        else if (ev.type === 'message') handleMessage(ev.message);
        else if (ev.type === 'activity') handleActivity(ev.event);
        else if (ev.type === 'repo') {
          AolNet.listRepos().then((r) => setRepos(r.repos || []));
        }
      });
    })();
    return () => { if (unsub) unsub(); };
  }, [signedOn, selectedRepo, upsertAgent, upsertClaim, handleMessage, handleActivity]);

  // periodically refresh repos so the buddy list reflects new repos
  React.useEffect(() => {
    if (!signedOn) return;
    const t = setInterval(() => {
      AolNet.listRepos().then((r) => setRepos(r.repos || [])).catch(() => {});
      AolNet.listAgents().then((r) => setAgents(r.agents || [])).catch(() => {});
    }, 5000);
    return () => clearInterval(t);
  }, [signedOn]);

  // --- derived ----------------------------------------------------------
  const agentsByRepo = React.useMemo(() => {
    const m = {};
    for (const a of agents) {
      if (!m[a.repoPath]) m[a.repoPath] = [];
      m[a.repoPath].push(a);
    }
    return m;
  }, [agents]);

  const filteredClaims = React.useMemo(
    () => (selectedRepo ? claims.filter(c => c.repoPath === selectedRepo) : claims),
    [claims, selectedRepo]
  );

  const selectedRepoMeta = repos.find(r => r.repoPath === selectedRepo);
  const repoAgentCount = selectedRepo ? (agentsByRepo[selectedRepo] || []).filter(a => a.status !== 'offline').length : 0;

  // --- window manager ---------------------------------------------------
  const openWin = (key) => {
    setWindows(w => ({ ...w, [key]: { ...w[key], open: true, z: zCounter + 1 } }));
    setActiveWin(key);
    setZCounter(z => z + 1);
  };
  const closeWin = (key) => setWindows(w => ({ ...w, [key]: { ...w[key], open: false } }));
  const activateWin = (key) => {
    setActiveWin(key);
    setWindows(w => ({ ...w, [key]: { ...w[key], z: zCounter + 1 } }));
    setZCounter(z => z + 1);
  };

  const openDM = async (agent) => {
    if (!openDMs.includes(agent.id)) {
      setOpenDMs(d => [...d, agent.id]);
      try {
        const r = await AolNet.getMessages({ repoPath: agent.repoPath, peer: agent.id, agentId: 'observer' });
        // include any messages between the agent and others as a fallback (no exclusive observer pairing)
        setDms(d => ({ ...d, [agent.id]: r.messages || [] }));
      } catch (e) {}
      AudioFx.knock();
    }
    setActiveWin('dm:' + agent.id);
  };
  const closeDM = (agentId) => setOpenDMs(d => d.filter(id => id !== agentId));

  const sendDM = async (agentId, body) => {
    const agent = agents.find(a => a.id === agentId);
    if (!agent) return;
    try {
      // Observer has to exist as an agent to send. Lazy register.
      if (!observer.id) {
        const reg = await AolNet.registerObserver({ name: observer.name, repoPath: agent.repoPath });
        setObserver(o => ({ ...o, id: reg.agent.id }));
        observer.id = reg.agent.id;
      }
      await AolNet.sendMessage({ from: observer.id, to: agentId, repoPath: agent.repoPath, body });
      AudioFx.imSend();
    } catch (e) {
      setErrorBanner('dm failed: ' + e.message);
    }
  };

  const sendRoom = async (body) => {
    if (!selectedRepo) return;
    try {
      if (!observer.id) {
        const reg = await AolNet.registerObserver({ name: observer.name, repoPath: selectedRepo });
        setObserver(o => ({ ...o, id: reg.agent.id }));
        observer.id = reg.agent.id;
      }
      await AolNet.sendMessage({ from: observer.id, repoPath: selectedRepo, body });
      AudioFx.imSend();
    } catch (e) {
      setErrorBanner('room post failed: ' + e.message);
    }
  };

  const onForceRelease = async (claim) => {
    try {
      await AolNet.releaseClaim(claim.id, '(observer-released)');
    } catch (e) {
      setErrorBanner('release failed: ' + e.message);
    }
  };

  if (!signedOn) {
    return <SignOn onDone={({ name, repoPath }) => {
      setObserver({ name, repoPath });
      setSelectedRepo(repoPath);
      setSignedOn(true);
    }} />;
  }

  const dmListFor = (id) => {
    const list = (dms[id] || []).slice().sort((a, b) => a.ts - b.ts);
    return list;
  };

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

        {/* Buddy list */}
        {windows.buddies.open && (
          <div style={{ zIndex: windows.buddies.z, position: 'absolute' }}>
            <Win id="buddies" title={windows.buddies.title} icon={Icon.buddies}
                 x={windows.buddies.x} y={windows.buddies.y} w={windows.buddies.w} h={windows.buddies.h}
                 active={activeWin === 'buddies'} onActivate={activateWin} onClose={closeWin}
                 minSize={{ w: 240, h: 320 }}>
              <BuddyList
                repos={repos}
                agentsByRepo={agentsByRepo}
                selectedRepo={selectedRepo}
                onSelectRepo={(rp) => setSelectedRepo(rp)}
                observerName={observer.name}
                onOpenDM={openDM}
                onOpenChat={() => openWin('chat')}
                onOpenFiles={() => openWin('files')}
                onOpenLog={() => openWin('log')}
                onOpenAbout={() => openWin('about')}
                signoff={() => {
                  AudioFx.signoff();
                  setTimeout(() => {
                    if (observer.id) AolNet.setOffline(observer.id).catch(() => {});
                    setSignedOn(false);
                  }, 600);
                }}
              />
            </Win>
          </div>
        )}

        {/* Chat */}
        {windows.chat.open && (
          <div style={{ zIndex: windows.chat.z, position: 'absolute' }}>
            <Win id="chat"
                 title={selectedRepoMeta ? 'Chat — ' + selectedRepoMeta.basename : 'Chat (pick a repo)'}
                 icon={Icon.chat}
                 x={windows.chat.x} y={windows.chat.y} w={windows.chat.w} h={windows.chat.h}
                 active={activeWin === 'chat'} onActivate={activateWin} onClose={closeWin}
                 minSize={{ w: 360, h: 280 }}>
              <ChatRoom
                repo={selectedRepoMeta}
                messages={messages}
                agentCount={repoAgentCount}
                onSend={sendRoom}
                observerName={observer.name}
                observerId={observer.id}
                repoPath={selectedRepo}
              />
            </Win>
          </div>
        )}

        {/* Files */}
        {windows.files.open && (
          <div style={{ zIndex: windows.files.z, position: 'absolute' }}>
            <Win id="files"
                 title={selectedRepoMeta ? 'File Targets — ' + selectedRepoMeta.basename : 'File Targets (all repos)'}
                 icon={Icon.files}
                 x={windows.files.x} y={windows.files.y} w={windows.files.w} h={windows.files.h}
                 active={activeWin === 'files'} onActivate={activateWin} onClose={closeWin}
                 minSize={{ w: 480, h: 200 }}>
              <FileTargets
                claims={filteredClaims}
                onMessage={(claim) => {
                  const a = agents.find(x => x.id === claim.agentId);
                  if (a) openDM(a);
                }}
                onForceRelease={onForceRelease}
              />
            </Win>
          </div>
        )}

        {/* Log */}
        {windows.log.open && (
          <div style={{ zIndex: windows.log.z, position: 'absolute' }}>
            <Win id="log"
                 title={selectedRepoMeta ? 'Activity — ' + selectedRepoMeta.basename : 'Activity (all repos)'}
                 icon={Icon.log}
                 x={windows.log.x} y={windows.log.y} w={windows.log.w} h={windows.log.h}
                 active={activeWin === 'log'} onActivate={activateWin} onClose={closeWin}
                 minSize={{ w: 360, h: 240 }}>
              <ActivityLog events={activity} repoPath={selectedRepo} />
            </Win>
          </div>
        )}

        {/* About */}
        {windows.about.open && (
          <div style={{ zIndex: windows.about.z, position: 'absolute' }}>
            <Win id="about" title={windows.about.title} icon={Icon.about}
                 x={windows.about.x} y={windows.about.y} w={windows.about.w} h={windows.about.h}
                 active={activeWin === 'about'} onActivate={activateWin} onClose={closeWin}
                 minSize={{ w: 360, h: 360 }}>
              <About port={window.location.port || '3312'} />
            </Win>
          </div>
        )}

        {/* DM popup windows */}
        {openDMs.map((id, i) => {
          const agent = agents.find(a => a.id === id);
          if (!agent) return null;
          return (
            <div key={id} style={{ zIndex: 100 + i, position: 'absolute' }}>
              <Win id={'dm:' + id} title={`IM with ${agent.name}`} icon={Icon.dm}
                   x={420 + i * 30} y={140 + i * 30} w={340} h={300}
                   active={activeWin === 'dm:' + id} onActivate={activateWin} onClose={() => closeDM(id)}
                   minSize={{ w: 260, h: 220 }}>
                <DMWindow agent={agent} log={dmListFor(id)} onSend={sendDM} observerName={observer.name} />
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
                <button className="btn" onClick={() => { AudioFx.signon(); }}>Test sign-on</button>
                <button className="btn" onClick={() => { AudioFx.knock(); }}>IM ping</button>
              </div>
              <div style={{ fontSize: 11, color: '#444', marginTop: 6 }}>
                Drag any titlebar to move. Resize from the bottom-right corner. Double-click a buddy to IM.
              </div>
            </div>
          </div>
        )}

        {errorBanner && (
          <div style={{ position: 'fixed', top: 4, right: 4, background: '#a00', color: '#fff', padding: '4px 8px', fontSize: 11, zIndex: 99998 }}
               onClick={() => setErrorBanner(null)}>
            {errorBanner} (click to dismiss)
          </div>
        )}
      </div>

      <div className="hint">tip: click a repo folder to scope · double-click a buddy to IM · drag titlebars to move</div>
    </>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
