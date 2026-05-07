import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');

export interface ClientConfig {
  baseUrl?: string;
  autospawn?: boolean;
}

export class AolClient {
  private baseUrl: string;
  private autospawn: boolean;

  constructor(opts: ClientConfig = {}) {
    const port = process.env.AOL_PORT || '3312';
    const host = process.env.AOL_HOST || '127.0.0.1';
    this.baseUrl = opts.baseUrl ?? `http://${host}:${port}`;
    this.autospawn = opts.autospawn !== false;
  }

  url(path: string): string {
    return this.baseUrl + path;
  }

  async health(): Promise<boolean> {
    try {
      const r = await fetch(this.url('/api/health'));
      return r.ok;
    } catch {
      return false;
    }
  }

  async ensureRunning(): Promise<void> {
    if (await this.health()) return;
    if (!this.autospawn) throw new Error('AOL daemon not running and autospawn disabled');
    await this.spawnDaemon();
    // wait for health
    const deadline = Date.now() + 8000;
    while (Date.now() < deadline) {
      if (await this.health()) return;
      await new Promise((r) => setTimeout(r, 200));
    }
    throw new Error('AOL daemon failed to start within 8s');
  }

  private async spawnDaemon(): Promise<void> {
    // Prefer the built daemon entry; fall back to tsx for dev runs.
    const builtEntry = path.join(ROOT, 'dist', 'daemon', 'index.js');
    const srcEntry = path.join(ROOT, 'src', 'daemon', 'index.ts');
    const node = process.execPath;
    let cmd: string;
    let args: string[];
    if (fs.existsSync(builtEntry)) {
      cmd = node;
      args = [builtEntry];
    } else {
      // try tsx via npx-style resolution from local install
      cmd = node;
      const tsxBin = path.join(ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs');
      if (!fs.existsSync(tsxBin)) {
        throw new Error('No built daemon and no tsx available; run `pnpm build` first.');
      }
      args = [tsxBin, srcEntry];
    }
    const child = spawn(cmd, args, {
      detached: true,
      stdio: 'ignore',
      env: process.env,
    });
    child.unref();
  }

  async req<T = any>(method: string, path: string, body?: unknown): Promise<T> {
    await this.ensureRunning();
    const r = await fetch(this.url(path), {
      method,
      headers: body ? { 'content-type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await r.text();
    let parsed: any = text;
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {}
    }
    if (!r.ok && r.status !== 409) {
      const msg = parsed?.error || `HTTP ${r.status}`;
      const err: any = new Error(msg);
      err.status = r.status;
      err.body = parsed;
      throw err;
    }
    if (r.status === 409) {
      const err: any = new Error('claim conflict');
      err.status = 409;
      err.conflict = parsed;
      throw err;
    }
    return parsed;
  }

  // Convenience wrappers
  registerAgent(input: { id?: string; name: string; repoPath: string; color?: string; role?: 'agent' | 'observer' }) {
    return this.req('POST', '/api/agents', input);
  }
  setOffline(agentId: string, awayMessage?: string) {
    return this.req('POST', `/api/agents/${encodeURIComponent(agentId)}/offline`, awayMessage ? { awayMessage } : {});
  }
  deleteAgent(agentId: string) {
    return this.req('DELETE', `/api/agents/${encodeURIComponent(agentId)}`);
  }
  listReusableAgents(repoPath: string) {
    const qs = new URLSearchParams({ repoPath });
    return this.req('GET', `/api/agents/reusable?${qs}`);
  }
  findObserver(repoPath: string) {
    const qs = new URLSearchParams({ repoPath });
    return this.req('GET', `/api/observer?${qs}`);
  }
  getInbox(agentId: string, since?: number) {
    const qs = new URLSearchParams({ agentId });
    if (since) qs.set('since', String(since));
    return this.req('GET', `/api/inbox?${qs}`);
  }
  getInboxSummary(agentId: string, since = 0) {
    const qs = new URLSearchParams({ agentId, since: String(since) });
    return this.req('GET', `/api/inbox-summary?${qs}`);
  }
  askObserver(input: { askerId: string; repoPath: string; question: string }) {
    return this.req('POST', '/api/questions', input);
  }
  getQuestion(ticketId: string) {
    return this.req('GET', `/api/questions/${encodeURIComponent(ticketId)}`);
  }
  suggestScreenNames(opts: { count?: number; repoPath?: string } = {}) {
    const qs = new URLSearchParams();
    if (opts.count) qs.set('count', String(opts.count));
    if (opts.repoPath) qs.set('repoPath', opts.repoPath);
    return this.req('GET', `/api/screen-names?${qs}`);
  }
  heartbeat(agentId: string) {
    return this.req('POST', `/api/agents/${encodeURIComponent(agentId)}/heartbeat`);
  }
  setStatus(
    agentId: string,
    update: { status: string; currentFile?: string; reason?: string; waitingOn?: string }
  ) {
    return this.req('POST', `/api/agents/${encodeURIComponent(agentId)}/status`, update);
  }
  claimFile(input: { agentId: string; file: string; mode?: 'edit' | 'review'; reason: string }) {
    return this.req('POST', '/api/claims', input);
  }
  releaseFile(claimId: string, summary?: string) {
    return this.req('POST', `/api/claims/${encodeURIComponent(claimId)}/release`, { summary });
  }
  listClaims(opts?: { repoPath?: string; activeOnly?: boolean }) {
    const qs = new URLSearchParams();
    if (opts?.repoPath) qs.set('repoPath', opts.repoPath);
    if (opts?.activeOnly === false) qs.set('active', 'false');
    return this.req('GET', `/api/claims?${qs}`);
  }
  inspectClaim(claimId: string) {
    return this.req('GET', `/api/claims/${encodeURIComponent(claimId)}`);
  }
  sendMessage(input: { from: string; to?: string | null; repoPath: string; body: string }) {
    return this.req('POST', '/api/messages', input);
  }
  getMessages(opts: { repoPath: string; since?: number; peer?: string; agentId?: string }) {
    const qs = new URLSearchParams();
    qs.set('repoPath', opts.repoPath);
    if (opts.since) qs.set('since', String(opts.since));
    if (opts.peer) qs.set('peer', opts.peer);
    if (opts.agentId) qs.set('agentId', opts.agentId);
    return this.req('GET', `/api/messages?${qs}`);
  }
  getActivity(opts: { repoPath?: string; since?: number; limit?: number }) {
    const qs = new URLSearchParams();
    if (opts.repoPath) qs.set('repoPath', opts.repoPath);
    if (opts.since) qs.set('since', String(opts.since));
    if (opts.limit) qs.set('limit', String(opts.limit));
    return this.req('GET', `/api/activity?${qs}`);
  }
  listAgents(repoPath?: string) {
    const qs = new URLSearchParams();
    if (repoPath) qs.set('repoPath', repoPath);
    return this.req('GET', `/api/agents?${qs}`);
  }
  listRepos() {
    return this.req('GET', '/api/repos');
  }
  hideRepo(repoPath: string) {
    return this.req('POST', '/api/repos/hide', { repoPath });
  }
  waitForRelease(input: { agentId: string; repoPath: string; file: string; timeoutMs?: number }) {
    return this.req('POST', '/api/wait', input);
  }
  markStarted(agentId: string, body: { file?: string; summary?: string }) {
    return this.req('POST', `/api/agents/${encodeURIComponent(agentId)}/started`, body);
  }
  markCompleted(agentId: string, body: { file?: string; summary?: string }) {
    return this.req('POST', `/api/agents/${encodeURIComponent(agentId)}/completed`, body);
  }
  markAbandoned(agentId: string, body: { file?: string; summary?: string }) {
    return this.req('POST', `/api/agents/${encodeURIComponent(agentId)}/abandoned`, body);
  }
}
