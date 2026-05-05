import { describe, it, expect } from 'vitest';
import { State, validateAgentMessage } from '../src/daemon/state.js';

describe('State', () => {
  it('registers an agent and lists by repo', () => {
    const s = new State(':memory:');
    const a = s.registerAgent({ name: 'alice', repoPath: '/tmp/repo-a', id: 'alice' });
    s.registerAgent({ name: 'bob', repoPath: '/tmp/repo-b', id: 'bob' });
    expect(a.name).toBe('alice');
    expect(s.listAgents('/tmp/repo-a').map((x) => x.id)).toEqual(['alice']);
    expect(s.listAgents('/tmp/repo-b').map((x) => x.id)).toEqual(['bob']);
    const repos = s.listRepos().map((r) => r.basename);
    expect(repos).toContain('repo-a');
    expect(repos).toContain('repo-b');
  });

  it('claims, conflicts, queues waiters, releases', () => {
    const s = new State(':memory:');
    s.registerAgent({ name: 'a', repoPath: '/tmp/r', id: 'a' });
    s.registerAgent({ name: 'b', repoPath: '/tmp/r', id: 'b' });
    s.registerAgent({ name: 'c', repoPath: '/tmp/r', id: 'c' });

    const r1 = s.claimFile({ agentId: 'a', file: 'x.ts', mode: 'edit', reason: 'first' });
    expect(r1.ok).toBe(true);

    const r2 = s.claimFile({ agentId: 'b', file: 'x.ts', mode: 'edit', reason: 'second' });
    expect(r2.ok).toBe(false);
    if (!r2.ok) {
      expect(r2.conflict.holder.agentId).toBe('a');
      expect(r2.conflict.queuePosition).toBe(1);
    }

    const r3 = s.claimFile({ agentId: 'c', file: 'x.ts', mode: 'edit', reason: 'third' });
    expect(r3.ok).toBe(false);
    if (!r3.ok) expect(r3.conflict.queuePosition).toBe(2);

    if (!r1.ok) throw new Error('expected ok');
    const released = s.releaseFile(r1.claim.id, 'done');
    expect(released?.releasedWaiters).toEqual(['b', 'c']);
  });

  it('rejects same-file double-claim from same agent as idempotent', () => {
    const s = new State(':memory:');
    s.registerAgent({ name: 'a', repoPath: '/tmp/r', id: 'a' });
    const r1 = s.claimFile({ agentId: 'a', file: 'x.ts', mode: 'edit', reason: 'first' });
    const r2 = s.claimFile({ agentId: 'a', file: 'x.ts', mode: 'edit', reason: 'first' });
    if (!r1.ok || !r2.ok) throw new Error('expected ok');
    expect(r1.claim.id).toBe(r2.claim.id);
  });

  it('messages: room + DM filtering', () => {
    const s = new State(':memory:');
    s.registerAgent({ name: 'a', repoPath: '/tmp/r', id: 'a' });
    s.registerAgent({ name: 'b', repoPath: '/tmp/r', id: 'b' });
    s.registerAgent({ name: 'c', repoPath: '/tmp/x', id: 'c' });
    s.addMessage({ from: 'a', to: null, body: 'hello room', repoPath: '/tmp/r' });
    s.addMessage({ from: 'a', to: 'b', body: 'hi b', repoPath: '/tmp/r' });
    s.addMessage({ from: 'c', to: null, body: 'other repo', repoPath: '/tmp/x' });

    const room = s.getMessages({ repoPath: '/tmp/r' });
    expect(room.length).toBe(1);
    expect(room[0].body).toBe('hello room');

    const dm = s.getMessages({ repoPath: '/tmp/r', agentId: 'a', peer: 'b' });
    expect(dm.length).toBe(1);
    expect(dm[0].body).toBe('hi b');

    const xroom = s.getMessages({ repoPath: '/tmp/x' });
    expect(xroom.length).toBe(1);
  });

  it('warns on fenced code blocks and long messages', () => {
    expect(validateAgentMessage('hi there')).toEqual([]);
    expect(validateAgentMessage('```\nx\n```').length).toBe(1);
    expect(validateAgentMessage('a'.repeat(800)).length).toBe(1);
  });

  it('activity log per repo with limits', () => {
    const s = new State(':memory:');
    s.registerAgent({ name: 'a', repoPath: '/tmp/r', id: 'a' });
    for (let i = 0; i < 10; i++) {
      s.addActivity({ repoPath: '/tmp/r', kind: 'msg', agentId: 'a', body: `m${i}` });
    }
    const got = s.getActivity({ repoPath: '/tmp/r', limit: 5 });
    expect(got.length).toBe(5);
    expect(got[got.length - 1].body).toBe('m9');
  });
});

describe('State (iteration 2)', () => {
  it('setAway sets status with message; janitor cutoff finds idle agents', () => {
    const s = new State(':memory:');
    s.registerAgent({ name: 'alice', repoPath: '/tmp/r', id: 'a' });
    const away = s.setAway('a', 'brb pog hunting');
    expect(away?.status).toBe('away');
    expect(away?.awayMessage).toBe('brb pog hunting');
    expect(typeof away?.awaySince).toBe('number');

    s.registerAgent({ name: 'bob', repoPath: '/tmp/r', id: 'b' });
    s.db.prepare(`UPDATE agents SET last_seen = 1 WHERE id = ?`).run('b');
    const eligible = s.agentsToAway(2);
    expect(eligible.map((x) => x.id)).toContain('b');
  });

  it('setOffline persists signedOffAt and listReusableAgents includes both away and offline', () => {
    const s = new State(':memory:');
    s.registerAgent({ name: 'a', repoPath: '/tmp/r', id: 'a' });
    s.registerAgent({ name: 'b', repoPath: '/tmp/r', id: 'b' });
    s.setAway('a');
    s.setOffline('b');
    const reusable = s.listReusableAgents('/tmp/r');
    expect(reusable.map((x) => x.id).sort()).toEqual(['a', 'b']);
    const offlineAgent = s.getAgent('b');
    expect(typeof offlineAgent?.signedOffAt).toBe('number');
  });

  it('resurrect via registerAgent clears away fields', () => {
    const s = new State(':memory:');
    s.registerAgent({ name: 'alice', repoPath: '/tmp/r', id: 'alice' });
    s.setAway('alice', 'brb');
    const reborn = s.registerAgent({ name: 'alice', repoPath: '/tmp/r', id: 'alice' });
    expect(reborn.status).toBe('online');
    expect(reborn.awayMessage).toBeUndefined();
    expect(reborn.awaySince).toBeUndefined();
  });

  it('deleteAgent only succeeds for offline agents', () => {
    const s = new State(':memory:');
    s.registerAgent({ name: 'a', repoPath: '/tmp/r', id: 'a' });
    const r1 = s.deleteAgent('a');
    expect(r1.ok).toBe(false);
    s.setOffline('a');
    const r2 = s.deleteAgent('a');
    expect(r2.ok).toBe(true);
    expect(s.getAgent('a')).toBeUndefined();
  });

  it('findObserver returns most recently active observer in repo', () => {
    const s = new State(':memory:');
    s.registerAgent({ name: 'human', repoPath: '/tmp/r', id: 'h1', role: 'observer' });
    s.registerAgent({ name: 'agent', repoPath: '/tmp/r', id: 'a1' });
    const obs = s.findObserver('/tmp/r');
    expect(obs?.id).toBe('h1');
    s.setOffline('h1');
    expect(s.findObserver('/tmp/r')).toBeNull();
  });

  it('inboxSummary counts unread DMs since cursor', () => {
    const s = new State(':memory:');
    s.registerAgent({ name: 'a', repoPath: '/tmp/r', id: 'a' });
    s.registerAgent({ name: 'b', repoPath: '/tmp/r', id: 'b' });
    s.addMessage({ repoPath: '/tmp/r', from: 'b', to: 'a', body: 'hey' });
    s.addMessage({ repoPath: '/tmp/r', from: 'b', to: 'a', body: 'hi' });
    const summ = s.inboxSummary('a', 0);
    expect(summ.unread).toBe(2);
    expect(summ.latestFrom).toBe('b');
  });

  it('pickEscalationPeer picks online non-observer peer in same repo', () => {
    const s = new State(':memory:');
    s.registerAgent({ name: 'asker', repoPath: '/tmp/r', id: 'asker' });
    s.registerAgent({ name: 'obs', repoPath: '/tmp/r', id: 'obs', role: 'observer' });
    s.registerAgent({ name: 'peer', repoPath: '/tmp/r', id: 'peer' });
    const peer = s.pickEscalationPeer('/tmp/r', 'asker');
    expect(peer?.id).toBe('peer');
  });
});
