import type { IncomingMessage, ServerResponse } from 'node:http';
import type { State } from './state.js';
import type { Bus } from './events.js';
import { normalizeRepoPath, repoBasename, validateAgentMessage } from './state.js';
import type { ClaimMode, BroadcastEvent } from '../shared/types.js';
import { startQuestion, onMessageMaybeAnswer } from './questions.js';
import { suggestScreenNames } from './lexicon.js';

type Json = unknown;

function send(res: ServerResponse, status: number, body: Json): void {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(data),
    'cache-control': 'no-store',
  });
  res.end(data);
}

async function readJson(req: IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (e) {
        reject(new Error('invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

function publishRepo(bus: Bus, repoPath: string): void {
  bus.publish({
    type: 'repo',
    repoPath,
    basename: repoBasename(repoPath),
  });
}

export async function handleApi(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  state: State,
  bus: Bus
): Promise<void> {
  const method = req.method ?? 'GET';
  const p = url.pathname;

  try {
    // ---------- AGENTS ----------
    if (p === '/api/agents' && method === 'POST') {
      const body = await readJson(req);
      if (!body.name || !body.repoPath) {
        return send(res, 400, { error: 'name and repoPath required' });
      }
      const agent = state.registerAgent(body);
      publishRepo(bus, agent.repoPath);
      bus.publish({ type: 'agent', repoPath: agent.repoPath, agent });
      const ev = state.addActivity({
        repoPath: agent.repoPath,
        kind: 'online',
        agentId: agent.id,
        body: agent.name,
      });
      bus.publish({ type: 'activity', repoPath: agent.repoPath, event: ev });
      return send(res, 201, { agent });
    }

    if (p === '/api/agents' && method === 'GET') {
      const repoPath = url.searchParams.get('repoPath') || undefined;
      return send(res, 200, { agents: state.listAgents(repoPath) });
    }

    if (p === '/api/agents/reusable' && method === 'GET') {
      const repoPath = url.searchParams.get('repoPath');
      if (!repoPath) return send(res, 400, { error: 'repoPath required' });
      return send(res, 200, { agents: state.listReusableAgents(repoPath) });
    }

    {
      const m = p.match(/^\/api\/agents\/([^/]+)\/offline$/);
      if (m && method === 'POST') {
        const body = await readJson(req).catch(() => ({}));
        const existing = state.getAgent(m[1]);
        if (!existing) return send(res, 404, { error: 'agent not found' });
        // Observers go straight to offline (no away state — they're the user).
        // Sub-agents go to "away" first, then the janitor flips them to offline
        // after 15 min idle.
        const isObserver = existing.role === 'observer';
        const agent = isObserver
          ? state.setOffline(m[1])
          : state.setAway(m[1], body.awayMessage);
        if (!agent) return send(res, 404, { error: 'agent not found' });
        bus.publish({ type: 'agent', repoPath: agent.repoPath, agent });
        const ev = state.addActivity({
          repoPath: agent.repoPath,
          kind: isObserver ? 'offline' : 'away',
          agentId: agent.id,
          body: isObserver ? undefined : agent.awayMessage,
        });
        bus.publish({ type: 'activity', repoPath: agent.repoPath, event: ev });
        return send(res, 200, { agent });
      }
    }
    {
      const m = p.match(/^\/api\/agents\/([^/]+)\/heartbeat$/);
      if (m && method === 'POST') {
        const agent = state.heartbeat(m[1]);
        if (!agent) return send(res, 404, { error: 'agent not found' });
        return send(res, 200, { agent });
      }
    }
    {
      const m = p.match(/^\/api\/agents\/([^/]+)\/status$/);
      if (m && method === 'POST') {
        const body = await readJson(req);
        const agent = state.setStatus(m[1], body);
        if (!agent) return send(res, 404, { error: 'agent not found' });
        bus.publish({ type: 'agent', repoPath: agent.repoPath, agent });
        const ev = state.addActivity({
          repoPath: agent.repoPath,
          kind: 'status',
          agentId: agent.id,
          body: agent.status,
          target: agent.currentFile,
        });
        bus.publish({ type: 'activity', repoPath: agent.repoPath, event: ev });
        return send(res, 200, { agent });
      }
    }
    // ---------- LIFECYCLE EVENTS ----------
    {
      const m = p.match(/^\/api\/agents\/([^/]+)\/(started|completed|abandoned)$/);
      if (m && method === 'POST') {
        const body = await readJson(req).catch(() => ({}));
        const kind = m[2] as 'started' | 'completed' | 'abandoned';
        const newStatus = kind === 'started' ? 'editing' : kind === 'completed' ? 'complete' : 'abandoned';
        const agent = state.setStatus(m[1], {
          status: newStatus,
          currentFile: body.file,
          reason: body.summary,
        });
        if (!agent) return send(res, 404, { error: 'agent not found' });
        bus.publish({ type: 'agent', repoPath: agent.repoPath, agent });
        const ev = state.addActivity({
          repoPath: agent.repoPath,
          kind: kind === 'started' ? 'started' : kind === 'completed' ? 'complete' : 'abandon',
          agentId: agent.id,
          target: body.file,
          body: body.summary,
        });
        bus.publish({ type: 'activity', repoPath: agent.repoPath, event: ev });
        return send(res, 200, { agent });
      }
    }

    {
      const m = p.match(/^\/api\/agents\/([^/]+)$/);
      if (m && method === 'DELETE') {
        const result = state.deleteAgent(m[1]);
        if (!result.ok) return send(res, 400, { error: result.reason });
        bus.publish({ type: 'agent-deleted', repoPath: result.agent.repoPath, agentId: result.agent.id });
        const ev = state.addActivity({
          repoPath: result.agent.repoPath,
          kind: 'delete',
          agentId: result.agent.id,
          body: result.agent.name,
        });
        bus.publish({ type: 'activity', repoPath: result.agent.repoPath, event: ev });
        return send(res, 200, { ok: true });
      }
    }

    // ---------- CLAIMS ----------
    if (p === '/api/claims' && method === 'POST') {
      const body = await readJson(req);
      if (!body.agentId || !body.file || !body.reason) {
        return send(res, 400, { error: 'agentId, file, reason required' });
      }
      const mode: ClaimMode = body.mode === 'review' ? 'review' : 'edit';
      try {
        const result = state.claimFile({ ...body, mode });
        if (!result.ok) {
          return send(res, 409, result.conflict);
        }
        const claim = result.claim;
        bus.publish({ type: 'claim', repoPath: claim.repoPath, claim });
        const ev = state.addActivity({
          repoPath: claim.repoPath,
          kind: 'claim',
          agentId: claim.agentId,
          target: claim.file,
          body: claim.reason,
        });
        bus.publish({ type: 'activity', repoPath: claim.repoPath, event: ev });
        const agent = state.getAgent(claim.agentId);
        if (agent) bus.publish({ type: 'agent', repoPath: claim.repoPath, agent });
        return send(res, 201, { claim });
      } catch (e: any) {
        return send(res, 400, { error: e.message });
      }
    }

    if (p === '/api/claims' && method === 'GET') {
      const repoPath = url.searchParams.get('repoPath') || undefined;
      const activeOnly = url.searchParams.get('active') !== 'false';
      return send(res, 200, { claims: state.listClaims({ repoPath, activeOnly }) });
    }

    {
      const m = p.match(/^\/api\/claims\/([^/]+)\/release$/);
      if (m && method === 'POST') {
        const body = await readJson(req).catch(() => ({}));
        const result = state.releaseFile(m[1], body.summary);
        if (!result) return send(res, 404, { error: 'claim not found or not active' });
        bus.publish({ type: 'release', repoPath: result.claim.repoPath, claim: result.claim });
        const ev = state.addActivity({
          repoPath: result.claim.repoPath,
          kind: 'release',
          agentId: result.claim.agentId,
          target: result.claim.file,
          body: body.summary || '',
        });
        bus.publish({ type: 'activity', repoPath: result.claim.repoPath, event: ev });
        const agent = state.getAgent(result.claim.agentId);
        if (agent) bus.publish({ type: 'agent', repoPath: result.claim.repoPath, agent });
        return send(res, 200, { claim: result.claim, releasedWaiters: result.releasedWaiters });
      }
    }
    {
      const m = p.match(/^\/api\/claims\/([^/]+)$/);
      if (m && method === 'GET') {
        const c = state.inspectClaim(m[1]);
        if (!c) return send(res, 404, { error: 'claim not found' });
        return send(res, 200, { claim: c });
      }
    }

    // ---------- WAIT ----------
    if (p === '/api/wait' && method === 'POST') {
      const body = await readJson(req);
      const repoPath = normalizeRepoPath(body.repoPath);
      const file = body.file as string;
      const timeoutMs = Math.min(Math.max(Number(body.timeoutMs) || 30000, 500), 120000);
      const existing = state.findActiveClaim(repoPath, file);
      if (!existing) {
        return send(res, 200, { waited: false, reason: 'no active claim' });
      }
      const claimId = existing.id;
      const t0 = Date.now();
      const onEvent = (ev: BroadcastEvent): void => {
        if (ev.type === 'release' && ev.claim.id === claimId) {
          cleanup();
          send(res, 200, { waited: true, releasedAt: ev.claim.releasedAt, summary: ev.claim.releaseSummary });
        }
      };
      const timer = setTimeout(() => {
        cleanup();
        send(res, 200, { waited: false, reason: 'timeout', elapsed: Date.now() - t0 });
      }, timeoutMs);
      const cleanup = (): void => {
        clearTimeout(timer);
        bus.off('event', onEvent);
        req.off('close', cleanup);
      };
      bus.on('event', onEvent);
      req.on('close', cleanup);
      return;
    }

    // ---------- MESSAGES ----------
    if (p === '/api/messages' && method === 'POST') {
      const body = await readJson(req);
      if (!body.from || !body.repoPath || typeof body.body !== 'string') {
        return send(res, 400, { error: 'from, repoPath, body required' });
      }
      const warnings = validateAgentMessage(body.body);
      const msg = state.addMessage({
        from: body.from,
        to: body.to ?? null,
        body: body.body,
        repoPath: body.repoPath,
      });
      bus.publish({ type: 'message', repoPath: msg.repoPath, message: msg });
      onMessageMaybeAnswer(state, bus, msg);
      const ev = state.addActivity({
        repoPath: msg.repoPath,
        kind: msg.to ? 'dm' : 'msg',
        agentId: msg.from,
        peer: msg.to ?? undefined,
        body: msg.body.slice(0, 200),
      });
      bus.publish({ type: 'activity', repoPath: msg.repoPath, event: ev });
      return send(res, 201, { message: msg, warnings });
    }
    if (p === '/api/messages' && method === 'GET') {
      const repoPath = url.searchParams.get('repoPath') || '__global__';
      const since = url.searchParams.get('since');
      const peer = url.searchParams.get('peer') || undefined;
      const agentId = url.searchParams.get('agentId') || undefined;
      const messages = state.getMessages({
        repoPath,
        since: since ? Number(since) : undefined,
        peer,
        agentId,
      });
      return send(res, 200, { messages });
    }

    // ---------- INBOX ----------
    if (p === '/api/inbox' && method === 'GET') {
      const agentId = url.searchParams.get('agentId');
      if (!agentId) return send(res, 400, { error: 'agentId required' });
      const since = Number(url.searchParams.get('since') ?? '0') || 0;
      const messages = state.getInbox(agentId, since);
      const cursor = messages.length ? messages[messages.length - 1].ts : since;
      return send(res, 200, { messages, cursor });
    }

    if (p === '/api/inbox-summary' && method === 'GET') {
      const agentId = url.searchParams.get('agentId');
      if (!agentId) return send(res, 400, { error: 'agentId required' });
      const since = Number(url.searchParams.get('since') ?? '0') || 0;
      return send(res, 200, state.inboxSummary(agentId, since));
    }

    // ---------- ACTIVITY ----------
    if (p === '/api/activity' && method === 'GET') {
      const repoPath = url.searchParams.get('repoPath') || undefined;
      const since = url.searchParams.get('since');
      const limit = url.searchParams.get('limit');
      return send(res, 200, {
        events: state.getActivity({
          repoPath,
          since: since ? Number(since) : undefined,
          limit: limit ? Number(limit) : undefined,
        }),
      });
    }

    // ---------- REPOS ----------
    if (p === '/api/repos' && method === 'GET') {
      return send(res, 200, { repos: state.listRepos() });
    }

    // ---------- HEALTH ----------
    if (p === '/api/health' && method === 'GET') {
      return send(res, 200, { ok: true, ts: Date.now() });
    }

    // ---------- OBSERVER ----------
    if (p === '/api/observer' && method === 'GET') {
      const repoPath = url.searchParams.get('repoPath');
      if (!repoPath) return send(res, 400, { error: 'repoPath required' });
      const obs = state.findObserver(repoPath);
      return send(res, 200, obs ? { found: true, observer: obs } : { found: false });
    }

    // ---------- QUESTIONS ----------
    if (p === '/api/questions' && method === 'POST') {
      const body = await readJson(req);
      if (!body.askerId || !body.repoPath || !body.question) {
        return send(res, 400, { error: 'askerId, repoPath, question required' });
      }
      const ticket = startQuestion(state, bus, body);
      return send(res, 201, {
        ticketId: ticket.id,
        observerId: ticket.observerId,
        escalatedImmediately: ticket.status === 'escalated' || ticket.status === 'expired',
        ticket,
      });
    }

    {
      const m = p.match(/^\/api\/questions\/([^/]+)$/);
      if (m && method === 'GET') {
        const q = state.getQuestion(m[1]);
        if (!q) return send(res, 404, { error: 'question not found' });
        let answer = null;
        if (q.answerMessageId) {
          answer = state
            .getMessages({
              repoPath: q.repoPath,
              agentId: q.askerId,
              peer: q.observerId ?? q.escalatedTo ?? undefined,
            })
            .find((mm) => mm.id === q.answerMessageId) ?? null;
        }
        return send(res, 200, { question: q, answer });
      }
    }

    // ---------- SCREEN NAMES ----------
    if (p === '/api/screen-names' && method === 'GET') {
      const count = Math.max(1, Math.min(20, Number(url.searchParams.get('count') ?? '5')));
      const repoPath = url.searchParams.get('repoPath') || undefined;
      const taken = new Set(state.listAgents(repoPath).map((a) => a.name));
      return send(res, 200, { names: suggestScreenNames(count, taken) });
    }

    return send(res, 404, { error: 'not found', path: p });
  } catch (e: any) {
    return send(res, 500, { error: e?.message ?? String(e) });
  }
}

export function handleSse(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  bus: Bus
): void {
  const repoPath = url.searchParams.get('repoPath');
  res.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache',
    connection: 'keep-alive',
    'access-control-allow-origin': '*',
  });
  const write = (ev: BroadcastEvent): void => {
    res.write(`data: ${JSON.stringify(ev)}\n\n`);
  };
  write({ type: 'hello', serverTime: Date.now() });
  const onEvent = (ev: BroadcastEvent): void => {
    if (!repoPath || ev.type === 'hello' || ev.type === 'repo' || ev.repoPath === normalizeRepoPath(repoPath)) {
      write(ev);
    }
  };
  const heartbeat = setInterval(() => {
    res.write(': hb\n\n');
  }, 15000);
  bus.on('event', onEvent);
  const close = (): void => {
    clearInterval(heartbeat);
    bus.off('event', onEvent);
    res.end();
  };
  req.on('close', close);
}
