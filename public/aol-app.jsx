/* global React, ReactDOM */
const { AudioFx, Win, Icon, AolNet, STATUS_COLORS, colorForName, avatarLetter, basename, tsHM, tsHMS, relTime } = window.AOL_DATA;
const { BuddyList, ChatRoom, DMWindow, FileTargets, ActivityLog, About } = window.AOL_WINDOWS;
const { SignOn } = window.AOL_SIGNON;

// ===== App ===============================================================
function App() {
  const [signedOn, setSignedOn] = React.useState(false);
  const [observer, setObserver] = React.useState({ name: 'observer', repoPath: null });
  // Synchronous read of observer id — useState updates don't propagate before
  // SSE events arrive after a fresh registerObserver call.
  const observerIdRef = React.useRef(null);
  // Every observer record we've registered this session (one per repo we've
  // touched). All of them get heartbeated, and all of them get beaconed offline
  // when the browser closes — the observer is "online" only while the UI is open.
  const observerIdsRef = React.useRef(new Set());
  React.useEffect(() => { observerIdRef.current = observer.id || null; }, [observer.id]);

  // server-sourced state
  const [repos, setRepos] = React.useState([]);
  const [agents, setAgents] = React.useState([]);
  const [claims, setClaims] = React.useState([]);
  const [activity, setActivity] = React.useState([]);
  const [messagesByRepo, setMessagesByRepo] = React.useState({});  // { repoPath: Message[] }
  const [dms, setDms] = React.useState({});                        // { agentId: Message[] }

  // window manager
  const [windows, setWindows] = React.useState({
    buddies: { open: true, x: 24, y: 56, w: 300, h: 460, z: 5, title: 'Buddy List', icon: Icon.buddies },
    files:   { open: true, x: 360, y: 460, w: 720, h: 280, z: 3, title: 'File Targets', icon: Icon.files },
    log:     { open: false, x: 920, y: 60, w: 460, h: 360, z: 2, title: 'Activity Log', icon: Icon.log },
    about:   { open: false, x: 220, y: 120, w: 460, h: 540, z: 6, title: 'About AOL', icon: Icon.about },
  });
  const [chatWindows, setChatWindows] = React.useState({});  // { repoPath: { x,y,w,h,z,open } }
  const [dmWindows, setDmWindows] = React.useState({});      // { agentId: { x,y,w,h,z,open } }
  const [filesScope, setFilesScope] = React.useState('all');
  const [logScope, setLogScope] = React.useState('all');
  const [chatPickerOpen, setChatPickerOpen] = React.useState(false);
  const [zCounter, setZCounter] = React.useState(10);
  const [activeWin, setActiveWin] = React.useState('buddies');
  const [soundsOn, setSoundsOn] = React.useState(true);
  const [errorBanner, setErrorBanner] = React.useState(null);

  React.useEffect(() => { AudioFx.setEnabled(soundsOn); }, [soundsOn]);

  const welcomedRef = React.useRef(false);
  React.useEffect(() => {
    if (signedOn && !welcomedRef.current) {
      welcomedRef.current = true;
      AudioFx.welcome();
    }
    if (!signedOn) welcomedRef.current = false;
  }, [signedOn]);

  // ----- helpers ----------------------------------------------------------
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
    const obsId = observerIdRef.current;
    const fromSelf = obsId && message.from === obsId;
    if (message.to === null) {
      // room message — append to per-repo scrollback
      setMessagesByRepo(m => {
        const list = m[message.repoPath] || [];
        return { ...m, [message.repoPath]: [...list, message] };
      });
      if (!fromSelf) AudioFx.imRecv();
    } else {
      // DM — file under the other party id
      const peerId = fromSelf ? message.to : message.from;
      setDms(d => ({ ...d, [peerId]: [...(d[peerId] || []), message] }));
      // Auto-reopen DM if addressed to observer
      if (obsId && message.to === obsId) {
        setDmWindows(w => ({
          ...w,
          [peerId]: {
            x: w[peerId]?.x ?? 420,
            y: w[peerId]?.y ?? 140,
            w: w[peerId]?.w ?? 340,
            h: w[peerId]?.h ?? 300,
            open: true,
            z: zCounter + 1,
          },
        }));
        setZCounter(z => z + 1);
        AudioFx.imRecv();
      } else if (!fromSelf) {
        AudioFx.imRecv();
      }
    }
  }, [zCounter]);

  const handleActivity = React.useCallback((event) => {
    setActivity((es) => [...es, event].slice(-300));
    // Don't audibly chime when the event is about the observer themselves
    // (e.g. lazy registration on first DM/room post).
    if (event.agentId === observerIdRef.current) return;
    if (event.kind === 'online') AudioFx.signon();
    if (event.kind === 'offline') AudioFx.signoff();
    if (event.kind === 'claim') AudioFx.workStart();
    if (event.kind === 'release') AudioFx.workDone();
    if (event.kind === 'complete') AudioFx.workDone();
  }, []);

  // ----- initial load + SSE subscription ---------------------------------
  React.useEffect(() => {
    if (!signedOn) return;
    let unsub;
    (async () => {
      try {
        const [r1, a1, c1, ev1] = await Promise.all([
          AolNet.listRepos(),
          AolNet.listAgents(),
          AolNet.listClaims(undefined, true),
          AolNet.getActivity({ limit: 200 }),
        ]);
        setRepos(r1.repos || []);
        setAgents(a1.agents || []);
        setClaims(c1.claims || []);
        setActivity(ev1.events || []);
      } catch (e) {
        setErrorBanner('failed to load: ' + e.message);
      }
      unsub = AolNet.subscribe(undefined, (ev) => {
        if (ev.type === 'agent') upsertAgent(ev.agent);
        else if (ev.type === 'agent-deleted') {
          setAgents(list => list.filter(a => a.id !== ev.agentId));
        }
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
  }, [signedOn, upsertAgent, upsertClaim, handleMessage, handleActivity]);

  // periodic refresh of repos/agents (catches bursts, agent counts, away→offline)
  React.useEffect(() => {
    if (!signedOn) return;
    const t = setInterval(() => {
      AolNet.listRepos().then((r) => setRepos(r.repos || [])).catch(() => {});
      AolNet.listAgents().then((r) => setAgents(r.agents || [])).catch(() => {});
    }, 5000);
    return () => clearInterval(t);
  }, [signedOn]);

  // ----- derived ----------------------------------------------------------
  // Observers are the human user themselves — don't show them as buddies.
  const agentsByRepo = React.useMemo(() => {
    const m = {};
    for (const a of agents) {
      if (a.role === 'observer') continue;
      if (!m[a.repoPath]) m[a.repoPath] = [];
      m[a.repoPath].push(a);
    }
    return m;
  }, [agents]);

  // ----- window manager ---------------------------------------------------
  const openWin = (key) => {
    setWindows(w => ({ ...w, [key]: { ...w[key], open: true, z: zCounter + 1 } }));
    setActiveWin(key);
    setZCounter(z => z + 1);
  };
  const closeWin = (key) => setWindows(w => ({ ...w, [key]: { ...w[key], open: false } }));
  const activateWin = (key) => {
    setActiveWin(key);
    if (key.startsWith('chat:')) {
      const repoPath = key.slice(5);
      setChatWindows(w => ({ ...w, [repoPath]: { ...w[repoPath], z: zCounter + 1 } }));
    } else if (key.startsWith('dm:')) {
      const id = key.slice(3);
      setDmWindows(w => ({ ...w, [id]: { ...w[id], z: zCounter + 1 } }));
    } else {
      setWindows(w => ({ ...w, [key]: { ...w[key], z: zCounter + 1 } }));
    }
    setZCounter(z => z + 1);
  };

  const openChatForRepo = async (repoPath) => {
    setChatWindows(w => {
      if (w[repoPath]?.open) {
        return { ...w, [repoPath]: { ...w[repoPath], z: zCounter + 1 } };
      }
      const count = Object.keys(w).length;
      return {
        ...w,
        [repoPath]: {
          x: w[repoPath]?.x ?? (360 + count * 24),
          y: w[repoPath]?.y ?? (56 + count * 24),
          w: w[repoPath]?.w ?? 540,
          h: w[repoPath]?.h ?? 380,
          open: true,
          z: zCounter + 1,
        },
      };
    });
    setZCounter(z => z + 1);
    setActiveWin('chat:' + repoPath);
    if (!messagesByRepo[repoPath]) {
      try {
        const r = await AolNet.getMessages({ repoPath });
        setMessagesByRepo(m => ({ ...m, [repoPath]: r.messages || [] }));
      } catch (e) {}
    }
  };

  const closeChat = (repoPath) => {
    setChatWindows(w => ({ ...w, [repoPath]: { ...(w[repoPath] || {}), open: false } }));
  };

  const openDM = async (agent) => {
    setDmWindows(w => {
      if (w[agent.id]?.open) {
        return { ...w, [agent.id]: { ...w[agent.id], z: zCounter + 1 } };
      }
      const count = Object.keys(w).length;
      return {
        ...w,
        [agent.id]: {
          x: w[agent.id]?.x ?? (420 + count * 30),
          y: w[agent.id]?.y ?? (140 + count * 30),
          w: w[agent.id]?.w ?? 340,
          h: w[agent.id]?.h ?? 300,
          open: true,
          z: zCounter + 1,
        },
      };
    });
    setZCounter(z => z + 1);
    setActiveWin('dm:' + agent.id);
    if (!dms[agent.id]) {
      try {
        const obsId = observerIdRef.current;
        if (obsId) {
          const r = await AolNet.getMessages({ repoPath: agent.repoPath, peer: agent.id, agentId: obsId });
          setDms(d => ({ ...d, [agent.id]: r.messages || [] }));
        } else {
          // No observer registered yet — nothing to load.
          setDms(d => ({ ...d, [agent.id]: [] }));
        }
      } catch (e) {}
    }
    AudioFx.knock();
  };

  const closeDM = (agentId) => {
    setDmWindows(w => ({ ...w, [agentId]: { ...(w[agentId] || {}), open: false } }));
  };

  // ----- observer registration (lazy, per repo) ---------------------------
  const ensureObserverFor = async (repoPath) => {
    if (observer.id && observer.repoPath === repoPath) return observer.id;
    try {
      const r = await AolNet.registerObserver({ name: observer.name, repoPath, role: 'observer' });
      const id = r.agent.id;
      // Update ref synchronously so SSE events arriving in the next tick see
      // the new id immediately, before React re-renders.
      observerIdRef.current = id;
      observerIdsRef.current.add(id);
      setObserver(o => ({ ...o, id, repoPath }));
      return id;
    } catch (e) {
      setErrorBanner('observer registration failed: ' + e.message);
      throw e;
    }
  };

  // Heartbeat every observer record we've registered, so the daemon doesn't
  // flip them to offline as long as this UI tab is open.
  React.useEffect(() => {
    if (!signedOn) return;
    const t = setInterval(() => {
      for (const id of observerIdsRef.current) {
        AolNet.heartbeat(id).catch(() => {});
      }
    }, 20_000);
    return () => clearInterval(t);
  }, [signedOn]);

  // When the tab is closing, best-effort flip every observer record to away
  // (the daemon's observer-staleness check will then move them to offline
  // within ~60s if the heartbeat doesn't resume).
  React.useEffect(() => {
    if (!signedOn) return;
    const onUnload = () => {
      for (const id of observerIdsRef.current) {
        AolNet.beaconOffline(id);
      }
    };
    window.addEventListener('beforeunload', onUnload);
    window.addEventListener('pagehide', onUnload);
    return () => {
      window.removeEventListener('beforeunload', onUnload);
      window.removeEventListener('pagehide', onUnload);
    };
  }, [signedOn]);

  const sendRoom = async (repoPath, body) => {
    try {
      const obsId = await ensureObserverFor(repoPath);
      await AolNet.sendMessage({ from: obsId, repoPath, body });
      AudioFx.imSend();
    } catch (e) {
      setErrorBanner('room post failed: ' + e.message);
    }
  };

  const sendDM = async (agentId, body) => {
    const agent = agents.find(a => a.id === agentId);
    if (!agent) return;
    try {
      const obsId = await ensureObserverFor(agent.repoPath);
      await AolNet.sendMessage({ from: obsId, to: agentId, repoPath: agent.repoPath, body });
      AudioFx.imSend();
    } catch (e) {
      setErrorBanner('dm failed: ' + e.message);
    }
  };

  const onForceRelease = async (claim) => {
    try {
      await AolNet.releaseClaim(claim.id, '(observer-released)');
    } catch (e) {
      setErrorBanner('release failed: ' + e.message);
    }
  };

  const onDelete = async (agent) => {
    if (!window.confirm(`Delete offline buddy ${agent.name}?`)) return;
    try { await AolNet.deleteAgent(agent.id); }
    catch (e) { setErrorBanner('delete failed: ' + e.message); }
  };

  if (!signedOn) {
    return <SignOn onDone={({ name }) => {
      setObserver({ name, repoPath: null });
      setSignedOn(true);
    }} />;
  }

  const dmListFor = (id) => (dms[id] || []).slice().sort((a, b) => a.ts - b.ts);

  return (
    <>
      <div className="desktop">
        {/* Desktop icons */}
        <div className="desk-icon" style={{ left: 16, top: 16 }} onDoubleClick={() => openWin('buddies')}>
          <div className="icon-img" style={{ background: '#ffd700', border: '2px solid #000', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28 }}>🏃</div>
          Buddy List
        </div>
        <div className="desk-icon" style={{ left: 16, top: 110 }} onDoubleClick={() => setChatPickerOpen(true)}>
          <div className="icon-img" style={{ background: '#fff', border: '2px solid #000', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28 }}>💬</div>
          Chat Rooms
        </div>
        <div className="desk-icon" style={{ left: 16, top: 204 }} onDoubleClick={() => openWin('files')}>
          <div className="icon-img" style={{ background: '#fff', border: '2px solid #000', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>📁</div>
          File Targets
        </div>
        <div className="desk-icon" style={{ left: 16, top: 298 }} onDoubleClick={() => openWin('log')}>
          <div className="icon-img" style={{ background: '#000', border: '2px solid #000', color: '#0f0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 14 }}>{'>_'}</div>
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
                observerName={observer.name}
                onOpenChatForRepo={openChatForRepo}
                onOpenDM={openDM}
                onOpenChatPicker={() => setChatPickerOpen(true)}
                onOpenFiles={() => openWin('files')}
                onOpenLog={() => openWin('log')}
                onOpenAbout={() => openWin('about')}
                onDelete={onDelete}
              />
            </Win>
          </div>
        )}

        {/* Per-repo chat windows */}
        {Object.entries(chatWindows).map(([repoPath, ws]) => ws.open && (
          <div key={'chat:' + repoPath} style={{ zIndex: ws.z, position: 'absolute' }}>
            <Win id={'chat:' + repoPath}
                 title={'Chat — ' + basename(repoPath)}
                 icon={Icon.chat}
                 x={ws.x} y={ws.y} w={ws.w} h={ws.h}
                 active={activeWin === 'chat:' + repoPath} onActivate={activateWin}
                 onClose={() => closeChat(repoPath)}
                 minSize={{ w: 360, h: 280 }}>
              <ChatRoom
                repo={repos.find(r => r.repoPath === repoPath)}
                messages={messagesByRepo[repoPath] || []}
                agentCount={(agentsByRepo[repoPath] || []).filter(a => a.status !== 'offline' && a.status !== 'away').length}
                onSend={(body) => sendRoom(repoPath, body)}
                observerName={observer.name}
                observerId={observer.id}
                repoPath={repoPath}
              />
            </Win>
          </div>
        ))}

        {/* Files (own scope) */}
        {windows.files.open && (
          <div style={{ zIndex: windows.files.z, position: 'absolute' }}>
            <Win id="files" title={windows.files.title} icon={Icon.files}
                 x={windows.files.x} y={windows.files.y} w={windows.files.w} h={windows.files.h}
                 active={activeWin === 'files'} onActivate={activateWin} onClose={closeWin}
                 minSize={{ w: 480, h: 200 }}>
              <FileTargets
                claims={claims}
                repos={repos}
                scope={filesScope}
                onScopeChange={setFilesScope}
                onMessage={(claim) => {
                  const a = agents.find(x => x.id === claim.agentId);
                  if (a) openDM(a);
                }}
                onForceRelease={onForceRelease}
              />
            </Win>
          </div>
        )}

        {/* Activity (own scope) */}
        {windows.log.open && (
          <div style={{ zIndex: windows.log.z, position: 'absolute' }}>
            <Win id="log" title={windows.log.title} icon={Icon.log}
                 x={windows.log.x} y={windows.log.y} w={windows.log.w} h={windows.log.h}
                 active={activeWin === 'log'} onActivate={activateWin} onClose={closeWin}
                 minSize={{ w: 360, h: 240 }}>
              <ActivityLog events={activity} repos={repos} scope={logScope} onScopeChange={setLogScope} agents={agents} />
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
        {Object.entries(dmWindows).map(([id, ws]) => {
          if (!ws.open) return null;
          const agent = agents.find(a => a.id === id);
          if (!agent) return null;
          return (
            <div key={'dm:' + id} style={{ zIndex: ws.z, position: 'absolute' }}>
              <Win id={'dm:' + id} title={`IM with ${agent.name}`} icon={Icon.dm}
                   x={ws.x} y={ws.y} w={ws.w} h={ws.h}
                   active={activeWin === 'dm:' + id} onActivate={activateWin} onClose={() => closeDM(id)}
                   minSize={{ w: 260, h: 220 }}>
                <DMWindow agent={agent} log={dmListFor(id)} onSend={sendDM} observerName={observer.name} />
              </Win>
            </div>
          );
        })}

        {/* Chat picker mini-dialog */}
        {chatPickerOpen && (
          <div style={{ position: 'fixed', inset: 0, display: 'grid', placeItems: 'center', background: 'rgba(0,0,0,0.3)', zIndex: 100000 }}
               onClick={() => setChatPickerOpen(false)}>
            <div className="win" style={{ width: 320 }} onClick={(e) => e.stopPropagation()}>
              <div className="win-titlebar">
                <span className="win-title-text">Open chat for…</span>
                <div className="win-btns"><button className="win-btn" onClick={() => setChatPickerOpen(false)}>×</button></div>
              </div>
              <div className="win-body" style={{ padding: 12 }}>
                {repos.length === 0 && <div style={{ color: '#666', fontSize: 12 }}>no repos yet — once an agent registers, you can open its chat.</div>}
                {repos.map(r => (
                  <div key={r.repoPath}
                       style={{ padding: '6px 8px', cursor: 'pointer', borderBottom: '1px solid #eee' }}
                       onClick={() => { openChatForRepo(r.repoPath); setChatPickerOpen(false); }}>
                    <b>{r.basename}</b> <span style={{ color: '#666' }}>· {r.agentCount} online</span>
                  </div>
                ))}
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

      <div className="hint">tip: double-click a repo folder to open chat · double-click a buddy to IM · right-click an offline buddy to delete · drag titlebars to move</div>
    </>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
