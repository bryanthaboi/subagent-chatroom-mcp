/* global React, ReactDOM */
const { AudioFx, Icon, AolNet, devlog } = window.AOL_DATA;
const { SignOn } = window.AOL_SIGNON;

// ===== App ===============================================================
// This file is the *controller*. All app state, side effects, observer
// registration, SSE wiring, and action callbacks live here. The active
// theme's Shell.jsx (window.AOL_THEME_SHELL) does the visual layout.
function App() {
  const [signedOn, setSignedOn] = React.useState(false);
  const [observer, setObserver] = React.useState({ name: 'observer', repoPath: null });
  // Synchronous read of observer ids — useState updates don't propagate before
  // SSE events arrive after a fresh registerObserver call.
  // Multiple observer records exist (one per repo), so we keep a Set of all
  // ids and a Map for repo->id dedupe.
  const observerIdsRef = React.useRef(new Set());
  const observerByRepoRef = React.useRef(new Map());
  // Read-side caches so handleMessage can read latest values without
  // re-creating the callback on every state update.
  const agentsRef = React.useRef([]);
  const dmWindowsRef = React.useRef({});

  // server-sourced state
  const [repos, setRepos] = React.useState([]);
  const [agents, setAgents] = React.useState([]);
  const [claims, setClaims] = React.useState([]);
  const [activity, setActivity] = React.useState([]);
  const [messagesByRepo, setMessagesByRepo] = React.useState({});  // { repoPath: Message[] }
  const [dms, setDms] = React.useState({});                        // { agentId: Message[] }

  // settings + theme list (loaded by theme-loader before app renders)
  const [settings, setSettings] = React.useState(window.__AOL_INITIAL_SETTINGS || {
    'theme.active': 'aol',
    'theme.externalDir': null,
    'audio.enabled': true,
    'debug.devlog': false,
  });
  const [themes, setThemes] = React.useState([]);

  // window manager
  const [windows, setWindows] = React.useState({
    buddies:  { open: true,  x: 24,  y: 56,  w: 300, h: 460, z: 5, title: 'Buddy List',   icon: Icon.buddies },
    files:    { open: true,  x: 360, y: 460, w: 720, h: 280, z: 3, title: 'File Targets', icon: Icon.files },
    log:      { open: false, x: 920, y: 60,  w: 460, h: 360, z: 2, title: 'Activity Log', icon: Icon.log },
    about:    { open: false, x: 220, y: 120, w: 460, h: 540, z: 6, title: 'About AOL',    icon: Icon.about },
    settings: { open: false, x: 280, y: 100, w: 480, h: 380, z: 4, title: 'Settings',     icon: Icon.about },
  });
  const [chatWindows, setChatWindows] = React.useState({});  // { repoPath: { x,y,w,h,z,open } }
  const [dmWindows, setDmWindows] = React.useState({});      // { agentId: { x,y,w,h,z,open } }
  const [filesScope, setFilesScope] = React.useState('all');
  const [logScope, setLogScope] = React.useState('all');
  const [zCounter, setZCounter] = React.useState(10);
  const [activeWin, setActiveWin] = React.useState('buddies');
  const [errorBanner, setErrorBanner] = React.useState(null);
  const demoRunningRef = React.useRef(false);
  const demoCancelRef = React.useRef(false);

  // settings → side effects
  React.useEffect(() => { AudioFx.setEnabled(!!settings['audio.enabled']); }, [settings['audio.enabled']]);
  React.useEffect(() => { window.AOL_DEBUG.enabled = !!settings['debug.devlog']; }, [settings['debug.devlog']]);

  const applySettingsPatch = React.useCallback(async (patch) => {
    try {
      const next = await AolNet.setSettings(patch);
      setSettings(next);
      if (patch['theme.active'] && patch['theme.active'] !== window.AOL_RESOLVED_THEME?.active?.name) {
        devlog('settings', 'theme changed → reload', patch['theme.active']);
        window.location.reload();
        return;
      }
      if ('theme.externalDir' in patch) {
        AolNet.listThemes().then((r) => setThemes(r.themes || [])).catch(() => {});
      }
    } catch (e) {
      setErrorBanner('settings save failed: ' + e.message);
    }
  }, []);

  // load theme list on sign-on (and whenever externalDir changes)
  React.useEffect(() => {
    if (!signedOn) return;
    AolNet.listThemes().then((r) => setThemes(r.themes || [])).catch(() => {});
  }, [signedOn, settings['theme.externalDir']]);

  // SSE settings broadcast (other tabs poking us)
  // No reload here — theme switch is the active tab's choice. Just sync values.
  React.useEffect(() => {
    if (!signedOn) return;
    AolNet.getSettings().then(setSettings).catch(() => {});
  }, [signedOn]);
  // Keep refs in sync with current state for use inside handleMessage.
  React.useEffect(() => { agentsRef.current = agents; }, [agents]);
  React.useEffect(() => { dmWindowsRef.current = dmWindows; }, [dmWindows]);

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
    const observerIds = observerIdsRef.current;
    const fromSelf = observerIds.has(message.from);
    if (message.to === null) {
      // room message — append to per-repo scrollback
      setMessagesByRepo(m => {
        const list = m[message.repoPath] || [];
        return { ...m, [message.repoPath]: [...list, message] };
      });
      if (!fromSelf) {
        // Pop the chat window open if closed (or bump z if already open),
        // mirroring AIM-style DM popups for room messages.
        setChatWindows(w => {
          const existing = w[message.repoPath];
          if (existing?.open) {
            return { ...w, [message.repoPath]: { ...existing, z: zCounter + 1 } };
          }
          const count = Object.keys(w).length;
          return {
            ...w,
            [message.repoPath]: {
              x: existing?.x ?? (360 + count * 24),
              y: existing?.y ?? (56 + count * 24),
              w: existing?.w ?? 540,
              h: existing?.h ?? 380,
              open: true,
              z: zCounter + 1,
            },
          };
        });
        setZCounter(z => z + 1);
        AudioFx.imRecv();
      }
      return;
    }
    // DM — file under the other party id
    const peerId = fromSelf ? message.to : message.from;
    setDms(d => ({ ...d, [peerId]: [...(d[peerId] || []), message] }));

    if (fromSelf) return; // we sent it; nothing else to do.

    // Is this DM addressed to a recipient we'd consider "us"? Three checks
    // for resilience: (a) one of OUR session's observer ids, (b) any agent in
    // the local list with role='observer' (covers stale observer records
    // from other tabs/sessions), (c) we already have an open DM window for
    // this peer (e.g. you opened the IM yourself, then they replied).
    const recipient = agentsRef.current.find(a => a.id === message.to);
    const recipientIsObserver = recipient?.role === 'observer';
    const ours = observerIds.has(message.to);
    const haveOpenWindow = !!dmWindowsRef.current[peerId]?.open;

    if (ours || recipientIsObserver || haveOpenWindow) {
      // Open the DM window (or just bump z if already open) and chime.
      setDmWindows(w => {
        const existing = w[peerId];
        if (existing?.open) {
          return { ...w, [peerId]: { ...existing, z: zCounter + 1 } };
        }
        return {
          ...w,
          [peerId]: {
            x: existing?.x ?? 420,
            y: existing?.y ?? 140,
            w: existing?.w ?? 340,
            h: existing?.h ?? 300,
            open: true,
            z: zCounter + 1,
          },
        };
      });
      setZCounter(z => z + 1);
      AudioFx.imRecv();
    }
    // Else: sub-agent-to-sub-agent traffic — file silently, don't disturb.
  }, [zCounter]);

  const handleActivity = React.useCallback((event) => {
    setActivity((es) => [...es, event].slice(-300));
    // Don't audibly chime when the event is about an observer record
    // (registration, heartbeat-driven offline, etc).
    if (observerIdsRef.current.has(event.agentId)) return;
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
        const obsId = observerByRepoRef.current.get(agent.repoPath);
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

  // ----- observer registration (per repo, deduped via Map) ---------------
  const ensureObserverFor = async (repoPath) => {
    const cached = observerByRepoRef.current.get(repoPath);
    if (cached) return cached;
    try {
      const r = await AolNet.registerObserver({ name: observer.name, repoPath, role: 'observer' });
      const id = r.agent.id;
      // Update refs synchronously so SSE events arriving in the next tick
      // already see the new id, before React re-renders.
      observerByRepoRef.current.set(repoPath, id);
      observerIdsRef.current.add(id);
      setObserver(o => ({ ...o, id, repoPath }));
      return id;
    } catch (e) {
      setErrorBanner('observer registration failed: ' + e.message);
      throw e;
    }
  };

  // Eagerly ensure an observer record exists in every repo we know about, so
  // sub-agents can find us via aol_find_observer and DM us right away.
  React.useEffect(() => {
    if (!signedOn) return;
    let cancelled = false;
    (async () => {
      for (const r of repos) {
        if (cancelled) return;
        if (!observerByRepoRef.current.has(r.repoPath)) {
          await ensureObserverFor(r.repoPath).catch(() => {});
        }
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedOn, repos]);

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

  // Hidden keybindings:
  //   Ctrl/Cmd+Shift+E — start the demo
  //   Ctrl/Cmd+Shift+G — cancel a running demo
  //   Ctrl/Cmd+Shift+B — wipe demo users + repo
  // Ctrl+E alone is reserved by the browser (omnibox), so we add Shift on all.
  React.useEffect(() => {
    if (!signedOn) return;
    const onKey = (e) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod || !e.shiftKey) return;
      const k = (e.key || '').toLowerCase();
      if (k === 'e') {
        e.preventDefault();
        if (demoRunningRef.current) return;
        demoRunningRef.current = true;
        demoCancelRef.current = false;
        window.AOL_DEMO.run({
          shouldCancel: () => demoCancelRef.current,
          onError: (msg) => {
            demoRunningRef.current = false;
            setErrorBanner(msg);
          },
          onDone: () => {
            demoRunningRef.current = false;
            demoCancelRef.current = false;
          },
        });
      } else if (k === 'g') {
        e.preventDefault();
        if (demoRunningRef.current) demoCancelRef.current = true;
      } else if (k === 'b') {
        e.preventDefault();
        // Cancel any in-flight demo first so the wipe isn't racing the script.
        if (demoRunningRef.current) demoCancelRef.current = true;
        window.AOL_DEMO.deleteAll({
          onError: (msg) => setErrorBanner(msg),
          onDone: () => {
            const repo = window.AOL_DEMO.DEMO_REPO;
            const ids = window.AOL_DEMO.DEMO_IDS;
            // Forget cached state for demo agents + repo.
            setAgents(list => list.filter(a => !ids.includes(a.id)));
            setChatWindows(w => {
              if (!w[repo]) return w;
              const copy = { ...w };
              delete copy[repo];
              return copy;
            });
            // Clear room scrollback for the demo repo.
            setMessagesByRepo(m => {
              if (!m[repo]) return m;
              const copy = { ...m };
              delete copy[repo];
              return copy;
            });
            // Clear DM scrollback with each demo agent.
            setDms(d => {
              const copy = { ...d };
              for (const id of ids) delete copy[id];
              return copy;
            });
            // Close any DM windows for demo agents.
            setDmWindows(w => {
              const copy = { ...w };
              for (const id of ids) delete copy[id];
              return copy;
            });
            AolNet.listRepos().then(r => setRepos(r.repos || [])).catch(() => {});
            AolNet.listAgents().then(r => setAgents(r.agents || [])).catch(() => {});
          },
        });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
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
  const onHideRepo = async (repo) => {
    if (!window.confirm(`Hide ${repo.basename} from the buddy list? It will reappear if any agent registers there again.`)) return;
    try {
      await AolNet.hideRepo(repo.repoPath);
      // Close any open chat window for that repo.
      setChatWindows(w => {
        if (!w[repo.repoPath]) return w;
        const copy = { ...w };
        delete copy[repo.repoPath];
        return copy;
      });
      // Refresh repo list.
      const r = await AolNet.listRepos();
      setRepos(r.repos || []);
    } catch (e) {
      setErrorBanner('hide failed: ' + e.message);
    }
  };

  if (!signedOn) {
    return <SignOn onDone={({ name }) => {
      setObserver({ name, repoPath: null });
      setSignedOn(true);
    }} />;
  }

  const Shell = window.AOL_THEME_SHELL || window.AOL_FALLBACK_SHELL;
  if (!Shell) {
    return (
      <div style={{ padding: 24, fontFamily: 'system-ui, sans-serif' }}>
        <h2>AOL — no shell loaded</h2>
        <p>Boot completed but no theme shell is available. Reload, or check the active theme.</p>
      </div>
    );
  }

  return <Shell {...{
    observer, repos, agentsByRepo, claims, activity, messagesByRepo, dms,
    settings, themes,
    sendRoom, sendDM,
    openChatForRepo,
    loadDM: openDM,
    forceRelease: onForceRelease,
    deleteAgent: onDelete,
    hideRepo: onHideRepo,
    setSettings: applySettingsPatch,
    windows, chatWindows, dmWindows,
    openWin, closeWin, activateWin,
    closeChat, closeDM,
    activeWin,
    filesScope, setFilesScope, logScope, setLogScope,
    errorBanner, dismissError: () => setErrorBanner(null),
  }}/>;
}


// Boot is gated on theme-loader.jsx resolving the theme + Shell; until then
// we don't render. If the loader is missing entirely, fall back to immediate
// render so existing dev workflows aren't broken.
const boot = () => ReactDOM.createRoot(document.getElementById('root')).render(<App />);
if (window.__AOL_BOOT_READY && typeof window.__AOL_BOOT_READY.then === 'function') {
  window.__AOL_BOOT_READY.then(boot);
} else {
  boot();
}
