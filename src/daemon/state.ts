import { randomUUID } from 'node:crypto';
import path from 'node:path';
import type {
  Agent,
  AgentStatus,
  Claim,
  ClaimMode,
  Message,
  ActivityEvent,
  ActivityKind,
  ConflictDetail,
} from '../shared/types.js';

const COLORS = [
  '#6BD0FF',
  '#FFD56A',
  '#9CFF6B',
  '#FF8FB1',
  '#C29CFF',
  '#FFB46B',
  '#A8FFEC',
  '#FF6B6B',
  '#B0FF6B',
  '#6B8AFF',
];

function pickColor(seed: string): string {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return COLORS[h % COLORS.length];
}

export function normalizeRepoPath(p: string): string {
  if (!p) return '__global__';
  return path.resolve(p);
}

export function repoBasename(p: string): string {
  if (p === '__global__') return 'global';
  return path.basename(p) || p;
}

export interface MessageFilter {
  repoPath: string;
  since?: number;
  peer?: string;
  agentId?: string;
}

export class State {
  private agents = new Map<string, Agent>();
  private claims = new Map<string, Claim>();
  private messages: Message[] = [];
  private activity: ActivityEvent[] = [];
  private repos = new Set<string>();

  listRepos(): { repoPath: string; basename: string; agentCount: number }[] {
    const counts = new Map<string, number>();
    for (const a of this.agents.values()) {
      if (a.status !== 'offline') counts.set(a.repoPath, (counts.get(a.repoPath) ?? 0) + 1);
    }
    const all = new Set<string>([...this.repos, ...counts.keys()]);
    return [...all]
      .sort()
      .map((repoPath) => ({
        repoPath,
        basename: repoBasename(repoPath),
        agentCount: counts.get(repoPath) ?? 0,
      }));
  }

  registerAgent(input: { id?: string; name: string; repoPath: string; color?: string }): Agent {
    const repoPath = normalizeRepoPath(input.repoPath);
    this.repos.add(repoPath);
    const id = input.id?.trim() || randomUUID();
    const existing = this.agents.get(id);
    const now = Date.now();
    const agent: Agent = existing
      ? { ...existing, name: input.name, repoPath, status: 'online', lastSeen: now }
      : {
          id,
          name: input.name,
          repoPath,
          status: 'online',
          color: input.color || pickColor(id),
          createdAt: now,
          lastSeen: now,
        };
    this.agents.set(id, agent);
    return agent;
  }

  setOffline(agentId: string): Agent | null {
    const a = this.agents.get(agentId);
    if (!a) return null;
    a.status = 'offline';
    a.lastSeen = Date.now();
    a.currentFile = undefined;
    a.reason = undefined;
    a.waitingOn = undefined;
    return a;
  }

  heartbeat(agentId: string): Agent | null {
    const a = this.agents.get(agentId);
    if (!a) return null;
    a.lastSeen = Date.now();
    if (a.status === 'offline') a.status = 'online';
    return a;
  }

  setStatus(
    agentId: string,
    update: { status: AgentStatus; currentFile?: string; reason?: string; waitingOn?: string }
  ): Agent | null {
    const a = this.agents.get(agentId);
    if (!a) return null;
    a.status = update.status;
    a.lastSeen = Date.now();
    a.currentFile = update.currentFile;
    a.reason = update.reason;
    a.waitingOn = update.waitingOn;
    return a;
  }

  getAgent(id: string): Agent | undefined {
    return this.agents.get(id);
  }

  listAgents(repoPath?: string): Agent[] {
    const all = [...this.agents.values()];
    return (repoPath ? all.filter((a) => a.repoPath === normalizeRepoPath(repoPath)) : all).sort(
      (a, b) => a.createdAt - b.createdAt
    );
  }

  /** Returns the existing active claim on (repo,file) or null. */
  findActiveClaim(repoPath: string, file: string): Claim | null {
    for (const c of this.claims.values()) {
      if (c.status === 'active' && c.repoPath === repoPath && c.file === file) return c;
    }
    return null;
  }

  claimFile(input: {
    agentId: string;
    file: string;
    mode: ClaimMode;
    reason: string;
  }): { ok: true; claim: Claim } | { ok: false; conflict: ConflictDetail } {
    const a = this.agents.get(input.agentId);
    if (!a) throw new Error(`unknown agent ${input.agentId}`);
    const repoPath = a.repoPath;
    const existing = this.findActiveClaim(repoPath, input.file);
    if (existing) {
      if (existing.agentId === input.agentId) {
        return { ok: true, claim: existing };
      }
      if (!existing.waiters.includes(input.agentId)) existing.waiters.push(input.agentId);
      const holder = this.agents.get(existing.agentId);
      return {
        ok: false,
        conflict: {
          conflict: true,
          holder: {
            agentId: existing.agentId,
            agentName: holder?.name ?? existing.agentName,
            mode: existing.mode,
            reason: existing.reason,
            startedAt: existing.startedAt,
          },
          claimId: existing.id,
          queuePosition: existing.waiters.indexOf(input.agentId) + 1,
        },
      };
    }
    const claim: Claim = {
      id: randomUUID(),
      agentId: input.agentId,
      agentName: a.name,
      repoPath,
      file: input.file,
      mode: input.mode,
      reason: input.reason,
      status: 'active',
      startedAt: Date.now(),
      waiters: [],
    };
    this.claims.set(claim.id, claim);
    a.currentFile = claim.file;
    a.reason = claim.reason;
    a.status = input.mode === 'edit' ? 'editing' : 'reviewing';
    a.lastSeen = Date.now();
    return { ok: true, claim };
  }

  releaseFile(claimId: string, summary?: string): { claim: Claim; releasedWaiters: string[] } | null {
    const c = this.claims.get(claimId);
    if (!c || c.status !== 'active') return null;
    c.status = 'released';
    c.releasedAt = Date.now();
    c.releaseSummary = summary;
    const waiters = [...c.waiters];
    const a = this.agents.get(c.agentId);
    if (a) {
      a.currentFile = undefined;
      a.reason = undefined;
      a.lastSeen = Date.now();
    }
    return { claim: c, releasedWaiters: waiters };
  }

  inspectClaim(claimId: string): Claim | null {
    return this.claims.get(claimId) ?? null;
  }

  listClaims(opts?: { repoPath?: string; activeOnly?: boolean }): Claim[] {
    const all = [...this.claims.values()];
    return all
      .filter((c) =>
        opts?.repoPath ? c.repoPath === normalizeRepoPath(opts.repoPath) : true
      )
      .filter((c) => (opts?.activeOnly ? c.status === 'active' : true))
      .sort((a, b) => b.startedAt - a.startedAt);
  }

  addMessage(input: { repoPath: string; from: string; to: string | null; body: string }): Message {
    const repoPath = normalizeRepoPath(input.repoPath);
    this.repos.add(repoPath);
    const fromAgent = this.agents.get(input.from);
    const warnings = validateAgentMessage(input.body);
    const msg: Message = {
      id: randomUUID(),
      repoPath,
      from: input.from,
      fromName: fromAgent?.name ?? input.from,
      to: input.to,
      body: input.body,
      ts: Date.now(),
      warnings: warnings.length ? warnings : undefined,
    };
    this.messages.push(msg);
    return msg;
  }

  getMessages(filter: MessageFilter): Message[] {
    const repoPath = normalizeRepoPath(filter.repoPath);
    return this.messages
      .filter((m) => m.repoPath === repoPath)
      .filter((m) => (filter.since ? m.ts > filter.since : true))
      .filter((m) => {
        if (filter.peer && filter.agentId) {
          // DM thread between agentId <-> peer
          return (
            (m.from === filter.agentId && m.to === filter.peer) ||
            (m.from === filter.peer && m.to === filter.agentId)
          );
        }
        if (filter.peer) {
          return m.to === filter.peer || m.from === filter.peer;
        }
        if (filter.agentId && filter.peer === undefined) {
          // all messages involving agent (room + dms)
          return m.to === null || m.to === filter.agentId || m.from === filter.agentId;
        }
        return m.to === null;
      })
      .sort((a, b) => a.ts - b.ts);
  }

  addActivity(input: {
    repoPath: string;
    kind: ActivityKind;
    agentId: string;
    target?: string;
    body?: string;
    peer?: string;
  }): ActivityEvent {
    const a = this.agents.get(input.agentId);
    const repoPath = normalizeRepoPath(input.repoPath);
    this.repos.add(repoPath);
    const ev: ActivityEvent = {
      id: randomUUID(),
      repoPath,
      kind: input.kind,
      agentId: input.agentId,
      agentName: a?.name ?? input.agentId,
      target: input.target,
      body: input.body,
      peer: input.peer,
      ts: Date.now(),
    };
    this.activity.push(ev);
    if (this.activity.length > 5000) this.activity.splice(0, 1000);
    return ev;
  }

  getActivity(opts?: { repoPath?: string; since?: number; limit?: number }): ActivityEvent[] {
    const limit = opts?.limit ?? 200;
    const repoPath = opts?.repoPath ? normalizeRepoPath(opts.repoPath) : undefined;
    const filtered = this.activity
      .filter((e) => (repoPath ? e.repoPath === repoPath : true))
      .filter((e) => (opts?.since ? e.ts > opts.since : true))
      .sort((a, b) => a.ts - b.ts);
    return filtered.slice(-limit);
  }
}

const FENCE_RE = /```/;
const TOO_LONG = 600;

export function validateAgentMessage(body: string): string[] {
  const warnings: string[] = [];
  if (FENCE_RE.test(body)) {
    warnings.push('contains fenced code block — agents should describe in prose, not paste code');
  }
  if (body.length > TOO_LONG) {
    warnings.push(`message is ${body.length} chars; keep under ${TOO_LONG} for agent-to-agent traffic`);
  }
  return warnings;
}
