import { randomUUID } from 'node:crypto';
import path from 'node:path';
import type {
  Agent,
  AgentStatus,
  AgentRole,
  Claim,
  ClaimMode,
  Message,
  ActivityEvent,
  ActivityKind,
  ConflictDetail,
  Question,
  QuestionStatus,
  InboxSummary,
} from '../shared/types.js';
import { openDb, type Db } from './db.js';
import { pickAwayMessage } from './lexicon.js';

const COLORS = [
  '#6BD0FF', '#FFD56A', '#9CFF6B', '#FF8FB1', '#C29CFF', '#FFB46B',
  '#A8FFEC', '#FF6B6B', '#B0FF6B', '#6B8AFF',
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

type AgentRow = {
  id: string;
  name: string;
  repo_path: string;
  status: AgentStatus;
  role: AgentRole;
  color: string;
  current_file: string | null;
  reason: string | null;
  waiting_on: string | null;
  away_message: string | null;
  away_since: number | null;
  signed_off_at: number | null;
  created_at: number;
  last_seen: number;
};

type ClaimRow = {
  id: string;
  agent_id: string;
  agent_name: string;
  repo_path: string;
  file: string;
  mode: ClaimMode;
  reason: string;
  status: 'active' | 'released';
  started_at: number;
  released_at: number | null;
  release_summary: string | null;
  waiters_json: string;
};

type MessageRow = {
  id: string;
  repo_path: string;
  from_id: string;
  from_name: string;
  to_id: string | null;
  body: string;
  ts: number;
  warnings_json: string | null;
};

type ActivityRow = {
  id: string;
  repo_path: string;
  kind: ActivityKind;
  agent_id: string;
  agent_name: string;
  target: string | null;
  body: string | null;
  peer: string | null;
  ts: number;
};

type RepoRow = { repo_path: string; basename: string; first_seen: number; last_seen: number };

type QuestionRow = {
  id: string;
  asker_id: string;
  repo_path: string;
  question: string;
  observer_id: string | null;
  status: QuestionStatus;
  sent_at: number;
  follow_up_at: number | null;
  escalated_at: number | null;
  escalated_to: string | null;
  answered_at: number | null;
  answer_message_id: string | null;
};

function rowToAgent(r: AgentRow): Agent {
  return {
    id: r.id,
    name: r.name,
    repoPath: r.repo_path,
    status: r.status,
    role: r.role,
    color: r.color,
    currentFile: r.current_file ?? undefined,
    reason: r.reason ?? undefined,
    waitingOn: r.waiting_on ?? undefined,
    awayMessage: r.away_message ?? undefined,
    awaySince: r.away_since ?? undefined,
    signedOffAt: r.signed_off_at ?? undefined,
    createdAt: r.created_at,
    lastSeen: r.last_seen,
  };
}

function rowToClaim(r: ClaimRow): Claim {
  return {
    id: r.id,
    agentId: r.agent_id,
    agentName: r.agent_name,
    repoPath: r.repo_path,
    file: r.file,
    mode: r.mode,
    reason: r.reason,
    status: r.status,
    startedAt: r.started_at,
    releasedAt: r.released_at ?? undefined,
    releaseSummary: r.release_summary ?? undefined,
    waiters: JSON.parse(r.waiters_json) as string[],
  };
}

function rowToMessage(r: MessageRow): Message {
  return {
    id: r.id,
    repoPath: r.repo_path,
    from: r.from_id,
    fromName: r.from_name,
    to: r.to_id,
    body: r.body,
    ts: r.ts,
    warnings: r.warnings_json ? (JSON.parse(r.warnings_json) as string[]) : undefined,
  };
}

function rowToActivity(r: ActivityRow): ActivityEvent {
  return {
    id: r.id,
    repoPath: r.repo_path,
    kind: r.kind,
    agentId: r.agent_id,
    agentName: r.agent_name,
    target: r.target ?? undefined,
    body: r.body ?? undefined,
    peer: r.peer ?? undefined,
    ts: r.ts,
  };
}

function rowToQuestion(r: QuestionRow): Question {
  return {
    id: r.id,
    askerId: r.asker_id,
    repoPath: r.repo_path,
    question: r.question,
    observerId: r.observer_id,
    status: r.status,
    sentAt: r.sent_at,
    followUpAt: r.follow_up_at ?? undefined,
    escalatedAt: r.escalated_at ?? undefined,
    escalatedTo: r.escalated_to ?? undefined,
    answeredAt: r.answered_at ?? undefined,
    answerMessageId: r.answer_message_id ?? undefined,
  };
}

export class State {
  readonly db: Db;

  constructor(filename?: string) {
    this.db = openDb(filename);
  }

  close(): void {
    this.db.close();
  }

  // ---------- repos ----------
  // Any new activity in a repo un-hides it. A previously hidden repo coming
  // back to life (e.g. demo re-run after a wipe) should reappear in the
  // buddy list immediately.
  private touchRepo(repoPath: string): void {
    const now = Date.now();
    const basename = repoBasename(repoPath);
    this.db
      .prepare(
        `INSERT INTO repos (repo_path, basename, first_seen, last_seen, hidden)
         VALUES (?, ?, ?, ?, 0)
         ON CONFLICT(repo_path) DO UPDATE SET last_seen = excluded.last_seen, hidden = 0`
      )
      .run(repoPath, basename, now, now);
  }

  listRepos(): { repoPath: string; basename: string; agentCount: number }[] {
    const rows = this.db
      .prepare(`SELECT * FROM repos WHERE hidden = 0 ORDER BY repo_path`)
      .all() as RepoRow[];
    const counts = this.db
      .prepare(
        `SELECT repo_path, COUNT(*) AS n FROM agents WHERE status NOT IN ('offline') GROUP BY repo_path`
      )
      .all() as { repo_path: string; n: number }[];
    const countMap = new Map(counts.map((c) => [c.repo_path, c.n]));
    return rows.map((r) => ({
      repoPath: r.repo_path,
      basename: r.basename,
      agentCount: countMap.get(r.repo_path) ?? 0,
    }));
  }

  hideRepo(repoPath: string): { ok: true } | { ok: false; reason: string } {
    const path = normalizeRepoPath(repoPath);
    const repo = this.db.prepare(`SELECT 1 FROM repos WHERE repo_path = ?`).get(path);
    if (!repo) return { ok: false, reason: 'repo not found' };
    const liveCount = this.db
      .prepare(
        `SELECT COUNT(*) AS n FROM agents WHERE repo_path = ? AND role = 'agent' AND status != 'offline'`
      )
      .get(path) as { n: number };
    if (liveCount.n > 0) {
      return { ok: false, reason: 'repo has agents not yet offline' };
    }
    this.db.prepare(`UPDATE repos SET hidden = 1 WHERE repo_path = ?`).run(path);
    return { ok: true };
  }

  // ---------- agents ----------
  registerAgent(input: {
    id?: string;
    name: string;
    repoPath: string;
    color?: string;
    role?: AgentRole;
  }): Agent {
    const repoPath = normalizeRepoPath(input.repoPath);
    this.touchRepo(repoPath);
    const id = input.id?.trim() || randomUUID();
    const role: AgentRole = input.role ?? 'agent';
    const now = Date.now();
    const existing = this.db.prepare(`SELECT * FROM agents WHERE id = ?`).get(id) as AgentRow | undefined;
    if (existing) {
      this.db
        .prepare(
          `UPDATE agents SET
            name = ?,
            repo_path = ?,
            status = 'online',
            role = ?,
            current_file = NULL,
            reason = NULL,
            waiting_on = NULL,
            away_message = NULL,
            away_since = NULL,
            signed_off_at = NULL,
            last_seen = ?
           WHERE id = ?`
        )
        .run(input.name, repoPath, role, now, id);
    } else {
      this.db
        .prepare(
          `INSERT INTO agents
            (id, name, repo_path, status, role, color, created_at, last_seen)
            VALUES (?, ?, ?, 'online', ?, ?, ?, ?)`
        )
        .run(id, input.name, repoPath, role, input.color ?? pickColor(id), now, now);
    }
    return this.getAgent(id)!;
  }

  setAway(agentId: string, awayMessage?: string): Agent | null {
    const a = this.getAgent(agentId);
    if (!a) return null;
    const now = Date.now();
    const msg = awayMessage ?? pickAwayMessage();
    this.db
      .prepare(
        `UPDATE agents SET
          status = 'away',
          away_message = ?,
          away_since = ?,
          current_file = NULL,
          reason = NULL,
          waiting_on = NULL,
          last_seen = ?
         WHERE id = ?`
      )
      .run(msg, now, now, agentId);
    return this.getAgent(agentId) ?? null;
  }

  setOffline(agentId: string): Agent | null {
    const a = this.getAgent(agentId);
    if (!a) return null;
    const now = Date.now();
    this.db
      .prepare(
        `UPDATE agents SET
          status = 'offline',
          signed_off_at = ?,
          current_file = NULL,
          reason = NULL,
          waiting_on = NULL,
          last_seen = ?
         WHERE id = ?`
      )
      .run(now, now, agentId);
    return this.getAgent(agentId) ?? null;
  }

  resurrectAgent(agentId: string): Agent | null {
    const a = this.getAgent(agentId);
    if (!a) return null;
    const now = Date.now();
    this.db
      .prepare(
        `UPDATE agents SET
          status = 'online',
          away_message = NULL,
          away_since = NULL,
          signed_off_at = NULL,
          last_seen = ?
         WHERE id = ?`
      )
      .run(now, agentId);
    return this.getAgent(agentId) ?? null;
  }

  deleteAgent(agentId: string): { ok: true; agent: Agent } | { ok: false; reason: string } {
    const a = this.getAgent(agentId);
    if (!a) return { ok: false, reason: 'not found' };
    if (a.status !== 'offline') return { ok: false, reason: 'agent must be offline before delete' };
    this.db.prepare(`DELETE FROM agents WHERE id = ?`).run(agentId);
    return { ok: true, agent: a };
  }

  heartbeat(agentId: string): Agent | null {
    const a = this.getAgent(agentId);
    if (!a) return null;
    const now = Date.now();
    if (a.status === 'offline' || a.status === 'away') {
      this.db
        .prepare(
          `UPDATE agents SET
            status = 'online',
            away_message = NULL,
            away_since = NULL,
            signed_off_at = NULL,
            last_seen = ?
           WHERE id = ?`
        )
        .run(now, agentId);
    } else {
      this.db.prepare(`UPDATE agents SET last_seen = ? WHERE id = ?`).run(now, agentId);
    }
    return this.getAgent(agentId) ?? null;
  }

  setStatus(
    agentId: string,
    update: { status: AgentStatus; currentFile?: string; reason?: string; waitingOn?: string }
  ): Agent | null {
    const a = this.getAgent(agentId);
    if (!a) return null;
    const now = Date.now();
    this.db
      .prepare(
        `UPDATE agents SET
          status = ?,
          current_file = ?,
          reason = ?,
          waiting_on = ?,
          last_seen = ?
         WHERE id = ?`
      )
      .run(
        update.status,
        update.currentFile ?? null,
        update.reason ?? null,
        update.waitingOn ?? null,
        now,
        agentId
      );
    return this.getAgent(agentId) ?? null;
  }

  getAgent(id: string): Agent | undefined {
    const row = this.db.prepare(`SELECT * FROM agents WHERE id = ?`).get(id) as AgentRow | undefined;
    return row ? rowToAgent(row) : undefined;
  }

  listAgents(repoPath?: string): Agent[] {
    const rows = (
      repoPath
        ? this.db
            .prepare(`SELECT * FROM agents WHERE repo_path = ? ORDER BY created_at`)
            .all(normalizeRepoPath(repoPath))
        : this.db.prepare(`SELECT * FROM agents ORDER BY created_at`).all()
    ) as AgentRow[];
    return rows.map(rowToAgent);
  }

  listReusableAgents(repoPath: string): Agent[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM agents WHERE repo_path = ? AND status IN ('away', 'offline') ORDER BY last_seen DESC`
      )
      .all(normalizeRepoPath(repoPath)) as AgentRow[];
    return rows.map(rowToAgent);
  }

  findObserver(repoPath: string): Agent | null {
    const row = this.db
      .prepare(
        `SELECT * FROM agents
         WHERE repo_path = ? AND role = 'observer' AND status NOT IN ('offline')
         ORDER BY last_seen DESC LIMIT 1`
      )
      .get(normalizeRepoPath(repoPath)) as AgentRow | undefined;
    return row ? rowToAgent(row) : null;
  }

  pickEscalationPeer(repoPath: string, askerId: string): Agent | null {
    const inRepo = this.db
      .prepare(
        `SELECT * FROM agents
         WHERE repo_path = ? AND id != ? AND role = 'agent' AND status NOT IN ('offline', 'away')
         ORDER BY last_seen DESC LIMIT 1`
      )
      .get(normalizeRepoPath(repoPath), askerId) as AgentRow | undefined;
    if (inRepo) return rowToAgent(inRepo);
    const anywhere = this.db
      .prepare(
        `SELECT * FROM agents
         WHERE id != ? AND role = 'agent' AND status NOT IN ('offline', 'away')
         ORDER BY last_seen DESC LIMIT 1`
      )
      .get(askerId) as AgentRow | undefined;
    return anywhere ? rowToAgent(anywhere) : null;
  }

  // ---------- janitor helpers ----------
  // Observers (the human user) never auto-age to away/offline by idleness;
  // they have their own staleness check driven by browser heartbeats.
  agentsToAway(idleCutoff: number): Agent[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM agents
         WHERE role != 'observer'
           AND status IN ('online','idle','editing','reviewing','waiting','complete','abandoned')
           AND last_seen < ?`
      )
      .all(idleCutoff) as AgentRow[];
    return rows.map(rowToAgent);
  }

  agentsToOffline(awayCutoff: number): Agent[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM agents
         WHERE role != 'observer'
           AND status = 'away' AND away_since IS NOT NULL AND away_since < ?`
      )
      .all(awayCutoff) as AgentRow[];
    return rows.map(rowToAgent);
  }

  /** Observers whose UI heartbeat has gone stale; should be flipped to offline. */
  observersToOffline(staleCutoff: number): Agent[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM agents
         WHERE role = 'observer'
           AND status != 'offline'
           AND last_seen < ?`
      )
      .all(staleCutoff) as AgentRow[];
    return rows.map(rowToAgent);
  }

  // ---------- claims ----------
  findActiveClaim(repoPath: string, file: string): Claim | null {
    const row = this.db
      .prepare(`SELECT * FROM claims WHERE repo_path = ? AND file = ? AND status = 'active' LIMIT 1`)
      .get(repoPath, file) as ClaimRow | undefined;
    return row ? rowToClaim(row) : null;
  }

  claimFile(input: {
    agentId: string;
    file: string;
    mode: ClaimMode;
    reason: string;
  }): { ok: true; claim: Claim } | { ok: false; conflict: ConflictDetail } {
    const a = this.getAgent(input.agentId);
    if (!a) throw new Error(`unknown agent ${input.agentId}`);
    const repoPath = a.repoPath;
    const existing = this.findActiveClaim(repoPath, input.file);
    if (existing) {
      if (existing.agentId === input.agentId) {
        return { ok: true, claim: existing };
      }
      const waiters = existing.waiters.slice();
      if (!waiters.includes(input.agentId)) waiters.push(input.agentId);
      this.db
        .prepare(`UPDATE claims SET waiters_json = ? WHERE id = ?`)
        .run(JSON.stringify(waiters), existing.id);
      const holder = this.getAgent(existing.agentId);
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
          queuePosition: waiters.indexOf(input.agentId) + 1,
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
    this.db
      .prepare(
        `INSERT INTO claims
          (id, agent_id, agent_name, repo_path, file, mode, reason, status, started_at, waiters_json)
          VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, '[]')`
      )
      .run(
        claim.id,
        claim.agentId,
        claim.agentName,
        claim.repoPath,
        claim.file,
        claim.mode,
        claim.reason,
        claim.startedAt
      );
    this.db
      .prepare(
        `UPDATE agents SET current_file = ?, reason = ?, status = ?, last_seen = ? WHERE id = ?`
      )
      .run(claim.file, claim.reason, input.mode === 'edit' ? 'editing' : 'reviewing', Date.now(), input.agentId);
    return { ok: true, claim };
  }

  releaseFile(claimId: string, summary?: string): { claim: Claim; releasedWaiters: string[] } | null {
    const row = this.db.prepare(`SELECT * FROM claims WHERE id = ?`).get(claimId) as ClaimRow | undefined;
    if (!row || row.status !== 'active') return null;
    const now = Date.now();
    this.db
      .prepare(`UPDATE claims SET status = 'released', released_at = ?, release_summary = ? WHERE id = ?`)
      .run(now, summary ?? null, claimId);
    const claim = rowToClaim({ ...row, status: 'released', released_at: now, release_summary: summary ?? null });
    this.db
      .prepare(`UPDATE agents SET current_file = NULL, reason = NULL, last_seen = ? WHERE id = ?`)
      .run(now, claim.agentId);
    return { claim, releasedWaiters: claim.waiters };
  }

  inspectClaim(claimId: string): Claim | null {
    const row = this.db.prepare(`SELECT * FROM claims WHERE id = ?`).get(claimId) as ClaimRow | undefined;
    return row ? rowToClaim(row) : null;
  }

  listClaims(opts?: { repoPath?: string; activeOnly?: boolean }): Claim[] {
    const where: string[] = [];
    const params: unknown[] = [];
    if (opts?.repoPath) {
      where.push('repo_path = ?');
      params.push(normalizeRepoPath(opts.repoPath));
    }
    if (opts?.activeOnly) {
      where.push("status = 'active'");
    }
    const sql =
      `SELECT * FROM claims` + (where.length ? ` WHERE ${where.join(' AND ')}` : '') + ` ORDER BY started_at DESC`;
    const rows = this.db.prepare(sql).all(...params) as ClaimRow[];
    return rows.map(rowToClaim);
  }

  // ---------- messages ----------
  addMessage(input: {
    repoPath: string;
    from: string;
    to: string | null;
    body: string;
    warnings?: string[];
  }): Message {
    const repoPath = normalizeRepoPath(input.repoPath);
    this.touchRepo(repoPath);
    const fromAgent = this.getAgent(input.from);
    const builtIn = validateAgentMessage(input.body);
    const warnings = (input.warnings ?? []).concat(builtIn);
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
    this.db
      .prepare(
        `INSERT INTO messages
          (id, repo_path, from_id, from_name, to_id, body, ts, warnings_json)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        msg.id,
        msg.repoPath,
        msg.from,
        msg.fromName,
        msg.to,
        msg.body,
        msg.ts,
        msg.warnings ? JSON.stringify(msg.warnings) : null
      );
    return msg;
  }

  getMessages(filter: MessageFilter): Message[] {
    const repoPath = normalizeRepoPath(filter.repoPath);
    const where: string[] = ['repo_path = ?'];
    const params: unknown[] = [repoPath];
    if (filter.since) {
      where.push('ts > ?');
      params.push(filter.since);
    }
    if (filter.peer && filter.agentId) {
      where.push('((from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?))');
      params.push(filter.agentId, filter.peer, filter.peer, filter.agentId);
    } else if (filter.peer) {
      where.push('(to_id = ? OR from_id = ?)');
      params.push(filter.peer, filter.peer);
    } else if (filter.agentId) {
      where.push('(to_id IS NULL OR to_id = ? OR from_id = ?)');
      params.push(filter.agentId, filter.agentId);
    } else {
      where.push('to_id IS NULL');
    }
    const rows = this.db
      .prepare(`SELECT * FROM messages WHERE ${where.join(' AND ')} ORDER BY ts ASC`)
      .all(...params) as MessageRow[];
    return rows.map(rowToMessage);
  }

  /**
   * Bulk-delete messages in a repo whose `from_id` or `to_id` matches any of
   * the given agent ids. Returns rows affected. Used by the demo cleanup
   * (Ctrl+Shift+B) to wipe a known set of demo agents' chat history.
   */
  wipeMessages(repoPath: string, agentIds: string[]): number {
    if (agentIds.length === 0) return 0;
    const placeholders = agentIds.map(() => '?').join(',');
    const stmt = this.db.prepare(
      `DELETE FROM messages
        WHERE repo_path = ?
          AND (from_id IN (${placeholders}) OR to_id IN (${placeholders}))`
    );
    const info = stmt.run(normalizeRepoPath(repoPath), ...agentIds, ...agentIds);
    return info.changes;
  }

  getInbox(agentId: string, since: number): Message[] {
    const rows = this.db
      .prepare(`SELECT * FROM messages WHERE to_id = ? AND ts > ? ORDER BY ts ASC`)
      .all(agentId, since) as MessageRow[];
    return rows.map(rowToMessage);
  }

  inboxSummary(agentId: string, since = 0): InboxSummary {
    const row = this.db
      .prepare(
        `SELECT COUNT(*) AS n, MAX(ts) AS latest_ts FROM messages WHERE to_id = ? AND ts > ?`
      )
      .get(agentId, since) as { n: number; latest_ts: number | null } | undefined;
    if (!row || row.n === 0) {
      return { unread: 0 };
    }
    const latest = this.db
      .prepare(`SELECT from_name FROM messages WHERE to_id = ? AND ts > ? ORDER BY ts DESC LIMIT 1`)
      .get(agentId, since) as { from_name: string } | undefined;
    return {
      unread: row.n,
      latestFrom: latest?.from_name,
      latestTs: row.latest_ts ?? undefined,
    };
  }

  // ---------- activity ----------
  addActivity(input: {
    repoPath: string;
    kind: ActivityKind;
    agentId: string;
    target?: string;
    body?: string;
    peer?: string;
  }): ActivityEvent {
    const a = this.getAgent(input.agentId);
    const repoPath = normalizeRepoPath(input.repoPath);
    this.touchRepo(repoPath);
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
    this.db
      .prepare(
        `INSERT INTO activity
          (id, repo_path, kind, agent_id, agent_name, target, body, peer, ts)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        ev.id,
        ev.repoPath,
        ev.kind,
        ev.agentId,
        ev.agentName,
        ev.target ?? null,
        ev.body ?? null,
        ev.peer ?? null,
        ev.ts
      );
    const count = (this.db.prepare(`SELECT COUNT(*) AS n FROM activity`).get() as { n: number }).n;
    if (count > 5000) {
      this.db
        .prepare(`DELETE FROM activity WHERE id IN (SELECT id FROM activity ORDER BY ts ASC LIMIT 1000)`)
        .run();
    }
    return ev;
  }

  getActivity(opts?: { repoPath?: string; since?: number; limit?: number }): ActivityEvent[] {
    const limit = opts?.limit ?? 200;
    const where: string[] = [];
    const params: unknown[] = [];
    if (opts?.repoPath) {
      where.push('repo_path = ?');
      params.push(normalizeRepoPath(opts.repoPath));
    }
    if (opts?.since) {
      where.push('ts > ?');
      params.push(opts.since);
    }
    const sql =
      `SELECT * FROM activity` +
      (where.length ? ` WHERE ${where.join(' AND ')}` : '') +
      ` ORDER BY ts ASC`;
    const rows = this.db.prepare(sql).all(...params) as ActivityRow[];
    const sliced = rows.slice(-limit);
    return sliced.map(rowToActivity);
  }

  // ---------- questions ----------
  insertQuestion(input: {
    askerId: string;
    repoPath: string;
    question: string;
    observerId: string | null;
    status: QuestionStatus;
  }): Question {
    const id = randomUUID();
    const now = Date.now();
    this.db
      .prepare(
        `INSERT INTO questions
          (id, asker_id, repo_path, question, observer_id, status, sent_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        input.askerId,
        normalizeRepoPath(input.repoPath),
        input.question,
        input.observerId,
        input.status,
        now
      );
    return this.getQuestion(id)!;
  }

  getQuestion(id: string): Question | undefined {
    const row = this.db.prepare(`SELECT * FROM questions WHERE id = ?`).get(id) as QuestionRow | undefined;
    return row ? rowToQuestion(row) : undefined;
  }

  updateQuestion(id: string, patch: Partial<QuestionRow>): Question | undefined {
    const fields = Object.keys(patch);
    if (fields.length === 0) return this.getQuestion(id);
    const set = fields.map((f) => `${f} = ?`).join(', ');
    const params = fields.map((f) => (patch as Record<string, unknown>)[f]);
    this.db.prepare(`UPDATE questions SET ${set} WHERE id = ?`).run(...params, id);
    return this.getQuestion(id);
  }

  questionsByStatus(statuses: QuestionStatus[]): Question[] {
    const placeholders = statuses.map(() => '?').join(',');
    const rows = this.db
      .prepare(`SELECT * FROM questions WHERE status IN (${placeholders}) ORDER BY sent_at ASC`)
      .all(...statuses) as QuestionRow[];
    return rows.map(rowToQuestion);
  }

  pendingQuestionsForAsker(askerId: string): Question[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM questions WHERE asker_id = ? AND status NOT IN ('answered','expired') ORDER BY sent_at ASC`
      )
      .all(askerId) as QuestionRow[];
    return rows.map(rowToQuestion);
  }
}
