import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { State } from '../src/daemon/state.js';
import { Bus } from '../src/daemon/events.js';
import { startQuestion, onMessageMaybeAnswer, advanceQuestions } from '../src/daemon/questions.js';

function setup(): { state: State; bus: Bus } {
  const state = new State(':memory:');
  const bus = new Bus();
  state.registerAgent({ name: 'asker', repoPath: '/tmp/r', id: 'asker' });
  state.registerAgent({ name: 'observer', repoPath: '/tmp/r', id: 'obs', role: 'observer' });
  state.registerAgent({ name: 'peer', repoPath: '/tmp/r', id: 'peer' });
  return { state, bus };
}

describe('questions', () => {
  it('sends DM to observer and creates pending ticket', () => {
    const { state, bus } = setup();
    const ticket = startQuestion(state, bus, { askerId: 'asker', repoPath: '/tmp/r', question: 'help' });
    expect(ticket.status).toBe('pending');
    expect(ticket.observerId).toBe('obs');
    const msgs = state.getMessages({ repoPath: '/tmp/r', agentId: 'asker', peer: 'obs' });
    expect(msgs.length).toBe(1);
    expect(msgs[0].body).toBe('help');
  });

  it('escalates immediately if no observer in repo', () => {
    const state = new State(':memory:');
    const bus = new Bus();
    state.registerAgent({ name: 'asker', repoPath: '/tmp/r', id: 'asker' });
    state.registerAgent({ name: 'peer', repoPath: '/tmp/r', id: 'peer' });
    const ticket = startQuestion(state, bus, { askerId: 'asker', repoPath: '/tmp/r', question: 'help' });
    expect(ticket.status === 'escalated' || ticket.status === 'expired').toBe(true);
    if (ticket.status === 'escalated') expect(ticket.escalatedTo).toBe('peer');
  });

  it('janitor sends follow-up at 5min and escalates at 8min', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(1_000_000_000));
    try {
      const { state, bus } = setup();
      const ticket = startQuestion(state, bus, { askerId: 'asker', repoPath: '/tmp/r', question: 'help' });
      vi.advanceTimersByTime(5 * 60 * 1000 + 1);
      advanceQuestions(state, bus, Date.now());
      const t1 = state.getQuestion(ticket.id)!;
      expect(t1.status).toBe('following_up');
      expect(t1.followUpAt).toBeDefined();

      vi.advanceTimersByTime(3 * 60 * 1000 + 1);
      advanceQuestions(state, bus, Date.now());
      const t2 = state.getQuestion(ticket.id)!;
      expect(t2.status).toBe('escalated');
      expect(t2.escalatedTo).toBe('peer');
    } finally {
      vi.useRealTimers();
    }
  });

  it('reply from observer marks ticket answered and stops escalation', () => {
    const { state, bus } = setup();
    const ticket = startQuestion(state, bus, { askerId: 'asker', repoPath: '/tmp/r', question: 'help' });
    const reply = state.addMessage({ repoPath: '/tmp/r', from: 'obs', to: 'asker', body: 'try X' });
    onMessageMaybeAnswer(state, bus, reply);
    const t = state.getQuestion(ticket.id)!;
    expect(t.status).toBe('answered');
    expect(t.answerMessageId).toBe(reply.id);
  });

  it('auto-tagged messages do not satisfy reply detection', () => {
    const { state, bus } = setup();
    const ticket = startQuestion(state, bus, { askerId: 'asker', repoPath: '/tmp/r', question: 'help' });
    const m = state.addMessage({
      repoPath: '/tmp/r',
      from: 'asker',
      to: 'obs',
      body: '??',
      warnings: ['auto:follow-up'],
    });
    onMessageMaybeAnswer(state, bus, m);
    expect(state.getQuestion(ticket.id)!.status).toBe('pending');
  });

  it('expires after 13 min if no peer answers', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(1_000_000_000));
    try {
      const { state, bus } = setup();
      const ticket = startQuestion(state, bus, { askerId: 'asker', repoPath: '/tmp/r', question: 'help' });
      vi.advanceTimersByTime(5 * 60 * 1000 + 1);
      advanceQuestions(state, bus, Date.now());
      vi.advanceTimersByTime(3 * 60 * 1000 + 1);
      advanceQuestions(state, bus, Date.now());
      expect(state.getQuestion(ticket.id)!.status).toBe('escalated');
      vi.advanceTimersByTime(5 * 60 * 1000 + 1);
      advanceQuestions(state, bus, Date.now());
      expect(state.getQuestion(ticket.id)!.status).toBe('expired');
    } finally {
      vi.useRealTimers();
    }
  });
});
