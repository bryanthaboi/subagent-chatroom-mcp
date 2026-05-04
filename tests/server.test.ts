import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer } from '../src/daemon/server.js';
import type { AddressInfo } from 'node:net';

let baseUrl: string;
let stop: () => Promise<void>;

beforeAll(async () => {
  const inst = createServer({ port: 0 });
  await inst.start();
  const port = (inst.server.address() as AddressInfo).port;
  baseUrl = `http://127.0.0.1:${port}`;
  stop = inst.stop;
});

afterAll(async () => {
  await stop();
});

async function api(method: string, path: string, body?: any): Promise<{ status: number; body: any }> {
  const r = await fetch(baseUrl + path, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let parsed: any = text;
  try {
    parsed = JSON.parse(text);
  } catch {}
  return { status: r.status, body: parsed };
}

describe('HTTP API', () => {
  it('health check', async () => {
    const r = await api('GET', '/api/health');
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
  });

  it('register, claim conflict, release, full cycle', async () => {
    const repoPath = '/tmp/test-repo-' + Date.now();
    const a = await api('POST', '/api/agents', { id: 'alice', name: 'alice', repoPath });
    expect(a.status).toBe(201);
    const b = await api('POST', '/api/agents', { id: 'bob', name: 'bob', repoPath });
    expect(b.status).toBe(201);

    const c1 = await api('POST', '/api/claims', {
      agentId: 'alice',
      file: 'foo.ts',
      mode: 'edit',
      reason: 'fix typo',
    });
    expect(c1.status).toBe(201);
    const claimId = c1.body.claim.id;

    const c2 = await api('POST', '/api/claims', {
      agentId: 'bob',
      file: 'foo.ts',
      mode: 'edit',
      reason: 'rename',
    });
    expect(c2.status).toBe(409);
    expect(c2.body.holder.agentId).toBe('alice');
    expect(c2.body.queuePosition).toBe(1);

    const list = await api('GET', `/api/claims?repoPath=${encodeURIComponent(repoPath)}`);
    expect(list.body.claims.length).toBe(1);

    const rel = await api('POST', `/api/claims/${claimId}/release`, { summary: 'done' });
    expect(rel.status).toBe(200);
    expect(rel.body.releasedWaiters).toContain('bob');
  });

  it('messages: room and DM', async () => {
    const repoPath = '/tmp/msg-repo-' + Date.now();
    await api('POST', '/api/agents', { id: 'a1', name: 'a1', repoPath });
    await api('POST', '/api/agents', { id: 'a2', name: 'a2', repoPath });
    await api('POST', '/api/messages', { from: 'a1', repoPath, body: 'hello room' });
    await api('POST', '/api/messages', { from: 'a1', to: 'a2', repoPath, body: 'hi a2' });
    const room = await api('GET', `/api/messages?repoPath=${encodeURIComponent(repoPath)}`);
    expect(room.body.messages.length).toBe(1);
    expect(room.body.messages[0].body).toBe('hello room');
    const dm = await api('GET', `/api/messages?repoPath=${encodeURIComponent(repoPath)}&agentId=a1&peer=a2`);
    expect(dm.body.messages.length).toBe(1);
    expect(dm.body.messages[0].body).toBe('hi a2');
  });

  it('warns on fenced code blocks in messages', async () => {
    const repoPath = '/tmp/warn-' + Date.now();
    await api('POST', '/api/agents', { id: 'w1', name: 'w1', repoPath });
    const m = await api('POST', '/api/messages', {
      from: 'w1',
      repoPath,
      body: 'see ```const x = 1;```',
    });
    expect(m.status).toBe(201);
    expect(m.body.warnings.length).toBeGreaterThan(0);
  });

  it('wait endpoint resolves on release', async () => {
    const repoPath = '/tmp/wait-' + Date.now();
    await api('POST', '/api/agents', { id: 'wa', name: 'wa', repoPath });
    await api('POST', '/api/agents', { id: 'wb', name: 'wb', repoPath });
    const c = await api('POST', '/api/claims', {
      agentId: 'wa',
      file: 'shared.ts',
      mode: 'edit',
      reason: 'work',
    });
    const claimId = c.body.claim.id;
    const waitPromise = api('POST', '/api/wait', {
      agentId: 'wb',
      repoPath,
      file: 'shared.ts',
      timeoutMs: 3000,
    });
    setTimeout(() => {
      void api('POST', `/api/claims/${claimId}/release`, { summary: 'ok' });
    }, 100);
    const w = await waitPromise;
    expect(w.body.waited).toBe(true);
  });

  it('lists repos with agent counts', async () => {
    const repos = await api('GET', '/api/repos');
    expect(repos.status).toBe(200);
    expect(Array.isArray(repos.body.repos)).toBe(true);
  });
});
