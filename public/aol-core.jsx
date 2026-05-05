/* global React, ReactDOM */

// === Audio (synthesized retro chimes + sampled .wav cues) ================
const AudioFx = (() => {
  let ctx = null;
  let enabled = true;
  const ensure = () => {
    if (!ctx) {
      try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {}
    }
    return ctx;
  };
  const tone = (freq, dur, type = 'square', when = 0, gain = 0.08) => {
    const c = ensure(); if (!c || !enabled) return;
    const t0 = c.currentTime + when;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g); g.connect(c.destination);
    osc.start(t0); osc.stop(t0 + dur + 0.02);
  };
  // Pre-cache <audio> elements per sample so rapid events don't restart from scratch.
  const samples = {};
  const sample = (name) => {
    if (!enabled) return;
    if (!samples[name]) {
      const a = new Audio(name);
      a.preload = 'auto';
      samples[name] = a;
    }
    try {
      // clone so overlapping events don't cut each other off
      const node = samples[name].cloneNode();
      node.volume = 0.9;
      node.play().catch(() => {});
    } catch (e) {}
  };
  return {
    setEnabled(v) { enabled = v; },
    isEnabled() { return enabled; },
    // Sampled cues per request
    signon()   { sample('dooropen.wav'); },
    signoff()  { sample('doorslam.wav'); },
    welcome()  { sample('welcome.wav'); },
    imRecv()   { sample('imrcv.wav'); },
    imSend()   { sample('imsend.wav'); },
    // Synthesized fallbacks for everything else (claim/release/wait/etc.)
    knock()        { tone(740, 0.06, 'square', 0); tone(740, 0.06, 'square', 0.12); },
    workStart()    { tone(523, 0.08, 'square', 0); tone(784, 0.1, 'square', 0.09); },
    workDone()     { tone(784, 0.08, 'square', 0); tone(1046, 0.08, 'square', 0.08); tone(1318, 0.16, 'square', 0.16); },
    waitResolved() { tone(622, 0.05, 'triangle', 0); tone(932, 0.1, 'triangle', 0.06); },
    error()        { tone(220, 0.18, 'sawtooth', 0, 0.06); }
  };
})();

// === Network ============================================================
// All UI state is sourced from the daemon (HTTP REST + SSE). Nothing is mocked.
const AolNet = (() => {
  const base = ''; // same-origin
  const j = async (method, path, body) => {
    const r = await fetch(base + path, {
      method,
      headers: body ? { 'content-type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await r.text();
    let parsed = text;
    try { parsed = JSON.parse(text); } catch (e) {}
    if (!r.ok && r.status !== 409) {
      const err = new Error(parsed?.error || ('HTTP ' + r.status));
      err.status = r.status;
      err.body = parsed;
      throw err;
    }
    if (r.status === 409) {
      const err = new Error('claim conflict');
      err.status = 409;
      err.conflict = parsed;
      throw err;
    }
    return parsed;
  };
  return {
    listRepos() { return j('GET', '/api/repos'); },
    listAgents(repoPath) {
      const qs = repoPath ? '?repoPath=' + encodeURIComponent(repoPath) : '';
      return j('GET', '/api/agents' + qs);
    },
    listClaims(repoPath, activeOnly) {
      const qs = new URLSearchParams();
      if (repoPath) qs.set('repoPath', repoPath);
      if (activeOnly === false) qs.set('active', 'false');
      return j('GET', '/api/claims?' + qs);
    },
    getMessages({ repoPath, since, peer, agentId } = {}) {
      const qs = new URLSearchParams();
      if (repoPath) qs.set('repoPath', repoPath);
      if (since) qs.set('since', String(since));
      if (peer) qs.set('peer', peer);
      if (agentId) qs.set('agentId', agentId);
      return j('GET', '/api/messages?' + qs);
    },
    getActivity({ repoPath, since, limit } = {}) {
      const qs = new URLSearchParams();
      if (repoPath) qs.set('repoPath', repoPath);
      if (since) qs.set('since', String(since));
      if (limit) qs.set('limit', String(limit));
      return j('GET', '/api/activity?' + qs);
    },
    sendMessage(input) { return j('POST', '/api/messages', input); },
    releaseClaim(claimId, summary) { return j('POST', '/api/claims/' + encodeURIComponent(claimId) + '/release', { summary }); },
    setOffline(agentId, awayMessage) {
      return j('POST', '/api/agents/' + encodeURIComponent(agentId) + '/offline', awayMessage ? { awayMessage } : {});
    },
    registerObserver({ name, repoPath, role = 'observer' }) {
      return j('POST', '/api/agents', { name, repoPath, role, color: '#000080' });
    },
    deleteAgent(id) { return j('DELETE', '/api/agents/' + encodeURIComponent(id)); },
    heartbeat(id) { return j('POST', '/api/agents/' + encodeURIComponent(id) + '/heartbeat'); },
    beaconOffline(id) {
      try {
        const url = '/api/agents/' + encodeURIComponent(id) + '/offline';
        const blob = new Blob(['{}'], { type: 'application/json' });
        return navigator.sendBeacon ? navigator.sendBeacon(url, blob) : false;
      } catch (e) { return false; }
    },
    subscribe(repoPath, onEvent) {
      const qs = repoPath ? '?repoPath=' + encodeURIComponent(repoPath) : '';
      const es = new EventSource('/api/events' + qs);
      es.onmessage = (ev) => {
        try { onEvent(JSON.parse(ev.data)); } catch (e) {}
      };
      return () => es.close();
    },
  };
})();

// === Helpers =============================================================
const STATUS_COLORS = {
  online: '#00aa00', idle: '#999900', editing: '#cc4400', reviewing: '#0088cc',
  waiting: '#7700aa', complete: '#006622', abandoned: '#666666', offline: '#aa0000',
  away: '#cc8800',
};

const PALETTE = ['#ff4444', '#aa44dd', '#0088cc', '#cc6600', '#226622',
  '#888800', '#cc3399', '#446677', '#dd5522', '#117755'];

function colorForName(name) {
  let h = 0; for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

function avatarLetter(name) {
  if (!name) return '?';
  return name.replace(/[^a-zA-Z0-9]/g, '').charAt(0).toUpperCase() || '?';
}

function basename(p) {
  if (!p) return '';
  if (p === '__global__') return 'global';
  const i1 = p.lastIndexOf('/');
  const i2 = p.lastIndexOf('\\');
  const idx = Math.max(i1, i2);
  return idx >= 0 ? (p.slice(idx + 1) || p) : p;
}

function tsHM(ms) {
  const d = new Date(ms);
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}
function tsHMS(ms) {
  const d = new Date(ms);
  return String(d.getHours()).padStart(2, '0') + ':' +
         String(d.getMinutes()).padStart(2, '0') + ':' +
         String(d.getSeconds()).padStart(2, '0');
}
function relTime(ts) {
  if (!ts) return '';
  const delta = Math.max(0, Date.now() - ts);
  if (delta < 60_000) return 'just now';
  if (delta < 3_600_000) return Math.floor(delta / 60_000) + 'm ago';
  if (delta < 86_400_000) return Math.floor(delta / 3_600_000) + 'h ago';
  return Math.floor(delta / 86_400_000) + 'd ago';
}

// ===== Window Manager ====================================================
const WindowContext = React.createContext(null);

function useWM() { return React.useContext(WindowContext); }

function makeId() { return 'w_' + Math.random().toString(36).slice(2, 9); }

// ===== Draggable window component ========================================
function Win({ id, title, icon, x, y, w, h, children, onClose, active, onActivate, resizable, minSize }) {
  const ref = React.useRef(null);
  const [pos, setPos] = React.useState({ x, y });
  const [size, setSize] = React.useState({ w, h });
  const [drag, setDrag] = React.useState(null);
  const [resz, setResz] = React.useState(null);

  React.useEffect(() => {
    const move = (e) => {
      if (drag) {
        setPos({
          x: Math.max(0, Math.min(window.innerWidth - 60, e.clientX - drag.dx)),
          y: Math.max(0, Math.min(window.innerHeight - 50, e.clientY - drag.dy)),
        });
      } else if (resz) {
        const min = minSize || { w: 220, h: 140 };
        setSize({
          w: Math.max(min.w, e.clientX - resz.x),
          h: Math.max(min.h, e.clientY - resz.y),
        });
      }
    };
    const up = () => { setDrag(null); setResz(null); };
    if (drag || resz) {
      window.addEventListener('mousemove', move);
      window.addEventListener('mouseup', up);
      return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
    }
  }, [drag, resz, minSize]);

  return (
    <div
      ref={ref}
      className={`win ${active ? '' : 'inactive'}`}
      style={{ left: pos.x, top: pos.y, width: size.w, height: size.h }}
      onMouseDown={() => onActivate && onActivate(id)}
    >
      <div
        className="win-titlebar"
        onMouseDown={(e) => {
          const r = ref.current.getBoundingClientRect();
          setDrag({ dx: e.clientX - r.left, dy: e.clientY - r.top });
        }}
        onDoubleClick={(e) => e.preventDefault()}
      >
        {icon && <span className="win-icon">{icon}</span>}
        <span className="win-title-text">{title}</span>
        <div className="win-btns">
          <button className="win-btn" title="Close" onClick={(e) => { e.stopPropagation(); onClose && onClose(id); }}>×</button>
        </div>
      </div>
      <div className="win-body">{children}</div>
      {resizable !== false && (
        <div
          style={{ position: 'absolute', right: 0, bottom: 0, width: 14, height: 14, cursor: 'nwse-resize', background: 'transparent' }}
          onMouseDown={(e) => {
            e.stopPropagation();
            const r = ref.current.getBoundingClientRect();
            setResz({ x: r.left, y: r.top });
          }}
        />
      )}
    </div>
  );
}

// pixel icon helpers — drawn via inline svg
const Icon = {
  buddies: (
    <svg width="16" height="16" viewBox="0 0 16 16" shapeRendering="crispEdges">
      <rect x="2" y="2" width="12" height="12" fill="#ffd700" stroke="#000"/>
      <rect x="6" y="4" width="4" height="3" fill="#000"/>
      <rect x="5" y="8" width="6" height="4" fill="#000"/>
    </svg>
  ),
  chat: (
    <svg width="16" height="16" viewBox="0 0 16 16" shapeRendering="crispEdges">
      <rect x="1" y="2" width="14" height="9" fill="#ffffff" stroke="#000"/>
      <rect x="3" y="11" width="3" height="2" fill="#ffffff" stroke="#000"/>
      <rect x="3" y="5" width="2" height="1" fill="#000"/>
      <rect x="6" y="5" width="2" height="1" fill="#000"/>
      <rect x="9" y="5" width="2" height="1" fill="#000"/>
    </svg>
  ),
  files: (
    <svg width="16" height="16" viewBox="0 0 16 16" shapeRendering="crispEdges">
      <rect x="2" y="2" width="9" height="12" fill="#ffffff" stroke="#000"/>
      <rect x="11" y="4" width="3" height="10" fill="#cccccc" stroke="#000"/>
      <rect x="4" y="5" width="5" height="1" fill="#000"/>
      <rect x="4" y="7" width="5" height="1" fill="#000"/>
      <rect x="4" y="9" width="3" height="1" fill="#000"/>
    </svg>
  ),
  folder: (
    <svg width="14" height="14" viewBox="0 0 16 16" shapeRendering="crispEdges">
      <rect x="1" y="4" width="14" height="10" fill="#ffd86b" stroke="#000"/>
      <rect x="1" y="3" width="6" height="2" fill="#ffd86b" stroke="#000"/>
    </svg>
  ),
  log: (
    <svg width="16" height="16" viewBox="0 0 16 16" shapeRendering="crispEdges">
      <rect x="2" y="2" width="12" height="12" fill="#000" stroke="#000"/>
      <rect x="3" y="4" width="2" height="1" fill="#0f0"/>
      <rect x="3" y="6" width="6" height="1" fill="#0f0"/>
      <rect x="3" y="8" width="4" height="1" fill="#0f0"/>
      <rect x="3" y="10" width="8" height="1" fill="#0f0"/>
    </svg>
  ),
  dm: (
    <svg width="16" height="16" viewBox="0 0 16 16" shapeRendering="crispEdges">
      <rect x="1" y="3" width="14" height="9" fill="#ffff80" stroke="#000"/>
      <polyline points="1,3 8,9 15,3" fill="none" stroke="#000"/>
    </svg>
  ),
  about: (
    <svg width="16" height="16" viewBox="0 0 16 16" shapeRendering="crispEdges">
      <circle cx="8" cy="8" r="6" fill="#0000a0" stroke="#000"/>
      <text x="8" y="12" fontFamily="serif" fontSize="10" fill="#fff" textAnchor="middle" fontWeight="bold">i</text>
    </svg>
  ),
};

window.AOL_DATA = {
  AudioFx, Win, Icon, AolNet,
  STATUS_COLORS, colorForName, avatarLetter, basename, tsHM, tsHMS, relTime,
};
