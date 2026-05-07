/* global React */
/*
  AOL demo emulator — drives a scripted, multi-second sequence of real API
  calls so a viewer can watch the buddy list, chat windows, file targets, and
  activity log all light up "as if" sub-agents are doing real work.

  Hidden keybindings (in the App):
    Ctrl/Cmd + Shift + E  — start the demo
    Ctrl/Cmd + Shift + G  — cancel a running demo
    Ctrl/Cmd + Shift + B  — wipe the demo users + repo (cleanup)

  Idempotent: uses stable agent ids so re-running just resurrects them.

  Exposes window.AOL_DEMO.{ run, deleteAll }.
*/

const DEMO_REPO = '/tmp/api-gateway';

const AGENTS = [
  { id: 'demo-bug',    name: 'xXBugSlayerXx',  color: '#FF6B6B' },
  { id: 'demo-dial',   name: 'dialUpDanielle', color: '#6BD0FF' },
  { id: 'demo-glitch', name: 'glitchKid42',    color: '#9CFF6B' },
  { id: 'demo-bash',   name: 'BashBandit99',   color: '#FFD56A' },
];

const DEMO_IDS = AGENTS.map(a => a.id);

class DemoCancelled extends Error {
  constructor() { super('cancelled'); this.name = 'DemoCancelled'; }
}

async function cancellableSleep(ms, shouldCancel) {
  // Poll cancellation in 100ms slices so cancel is responsive even mid-sleep.
  const slice = 100;
  let waited = 0;
  while (waited < ms) {
    if (shouldCancel()) throw new DemoCancelled();
    const left = Math.min(slice, ms - waited);
    await new Promise((r) => setTimeout(r, left));
    waited += left;
  }
}

async function api(method, path, body) {
  const r = await fetch(path, {
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
  return { status: r.status, body: parsed };
}

async function runDemo({ shouldCancel = () => false, onError = () => {}, onDone = () => {} } = {}) {
  // No status callbacks — this should look like real traffic to the viewer.
  // shouldCancel() is polled before each phase + during sleeps so the demo
  // can be aborted mid-flight.
  const sleep = (ms) => cancellableSleep(ms, shouldCancel);
  const checkCancel = () => { if (shouldCancel()) throw new DemoCancelled(); };
  try {
    checkCancel();
    // Phase 1 — sign-ons, one at a time so the buddy list visibly fills up
    for (const a of AGENTS) {
      await api('POST', '/api/agents', {
        id: a.id, name: a.name, repoPath: DEMO_REPO, color: a.color,
      });
      await sleep(2200);
    }

    await sleep(1500);

    // Phase 2 — dialUpDanielle posts
    await api('POST', '/api/messages', {
      from: 'demo-dial',
      repoPath: DEMO_REPO,
      body: 'claiming auth.ts to fix the jwt rotation, ~5 min',
    });

    await sleep(2600);

    // Phase 3 — claim
    await api('POST', '/api/claims', {
      agentId: 'demo-dial',
      file: 'src/auth.ts',
      mode: 'edit',
      reason: 'fix jwt rotation timing',
    });

    await sleep(2800);

    // Phase 4 — conflict
    await api('POST', '/api/claims', {
      agentId: 'demo-glitch',
      file: 'src/auth.ts',
      mode: 'edit',
      reason: 'csrf check needs the same module',
    });

    await sleep(2800);

    // Phase 5 — DM exchange
    await api('POST', '/api/messages', {
      from: 'demo-glitch',
      to: 'demo-dial',
      repoPath: DEMO_REPO,
      body: 'yo, eta on auth.ts? i need it for the csrf bit',
    });
    await sleep(2200);
    await api('POST', '/api/messages', {
      from: 'demo-dial',
      to: 'demo-glitch',
      repoPath: DEMO_REPO,
      body: '5 min — refactor first then push, will summarize',
    });

    await sleep(3000);

    // Phase 6 — ask observer
    await api('POST', '/api/questions', {
      askerId: 'demo-bash',
      repoPath: DEMO_REPO,
      question: 'should compliance metadata live in middleware or persistence?',
    });

    await sleep(3000);

    // Phase 7 — agent goes away
    await api('POST', '/api/agents/demo-bug/offline', {
      awayMessage: 'lunchables crisis',
    });

    await sleep(2800);

    // Phase 8 — release with summary
    await api('POST', '/api/agents/demo-dial/completed', {
      file: 'src/auth.ts',
      summary: 'jwt rotation fixed, expiry now staggered',
    });
    const list = await api('GET', `/api/claims?repoPath=${encodeURIComponent(DEMO_REPO)}`);
    const dialClaim = (list.body.claims || []).find(c => c.agentId === 'demo-dial' && c.file === 'src/auth.ts' && c.status === 'active');
    if (dialClaim) {
      await api('POST', `/api/claims/${dialClaim.id}/release`, {
        summary: 'rotation timing fixed; new tests added',
      });
    }

    await sleep(2400);

    // Phase 9 — glitchKid picks it up
    await api('POST', '/api/claims', {
      agentId: 'demo-glitch',
      file: 'src/auth.ts',
      mode: 'edit',
      reason: 'csrf check now that rotation is settled',
    });

    await sleep(2200);

    // Phase 10 — chat update
    await api('POST', '/api/messages', {
      from: 'demo-glitch',
      repoPath: DEMO_REPO,
      body: 'got it, doing the csrf bit on top of the rotation patch',
    });

    await sleep(2800);

    // Phase 11 — BashBandit99 marks completed
    await api('POST', '/api/agents/demo-bash/completed', {
      summary: 'compliance review covered, awaiting sign-off',
    });

    await sleep(2400);

    // Phase 12 — release the second claim
    const list2 = await api('GET', `/api/claims?repoPath=${encodeURIComponent(DEMO_REPO)}`);
    const glitchClaim = (list2.body.claims || []).find(c => c.agentId === 'demo-glitch' && c.file === 'src/auth.ts' && c.status === 'active');
    if (glitchClaim) {
      await api('POST', `/api/claims/${glitchClaim.id}/release`, {
        summary: 'csrf check landed on the rotation refactor',
      });
    }

    onDone();
  } catch (e) {
    if (e instanceof DemoCancelled) {
      onDone();
    } else {
      onError(e.message || String(e));
    }
  }
}

// Wipe the demo agents and hide their repo. Order matters: release any active
// claims, force every demo agent to status='offline', then DELETE each, then
// hide the repo so it disappears from the buddy list.
async function deleteAllDemo({ onError = () => {}, onDone = () => {} } = {}) {
  try {
    // 1) Release any active claims held by demo agents in the demo repo.
    const list = await fetch(`/api/claims?repoPath=${encodeURIComponent(DEMO_REPO)}`).then(r => r.json());
    for (const c of list.claims || []) {
      if (DEMO_IDS.includes(c.agentId) && c.status === 'active') {
        await fetch(`/api/claims/${encodeURIComponent(c.id)}/release`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ summary: '(cleanup)' }),
        });
      }
    }

    // 2) Force each demo agent to offline (delete requires status='offline').
    for (const id of DEMO_IDS) {
      await fetch(`/api/agents/${encodeURIComponent(id)}/status`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'offline' }),
      }).catch(() => {});
    }

    // 3) Delete each demo agent.
    for (const id of DEMO_IDS) {
      await fetch(`/api/agents/${encodeURIComponent(id)}`, { method: 'DELETE' }).catch(() => {});
    }

    // 4) Wipe every message in the demo repo from/to demo agents (room +
    //    DM history both go away — keeps the chat window empty if reopened).
    await fetch('/api/messages/wipe', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ repoPath: DEMO_REPO, agentIds: DEMO_IDS }),
    }).catch(() => {});

    // 5) Hide the demo repo so the empty folder doesn't linger in the list.
    await fetch('/api/repos/hide', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ repoPath: DEMO_REPO }),
    }).catch(() => {});

    onDone();
  } catch (e) {
    onError(e.message || String(e));
  }
}

window.AOL_DEMO = { run: runDemo, deleteAll: deleteAllDemo, DEMO_REPO, DEMO_IDS };
