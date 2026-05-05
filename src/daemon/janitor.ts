import type { State } from './state.js';
import type { Bus } from './events.js';
import { advanceQuestions } from './questions.js';

const AWAY_AFTER_MS = 15 * 60 * 1000;
const OFFLINE_AFTER_MS = 15 * 60 * 1000;

export interface JanitorOptions {
  intervalMs?: number;
  awayAfterMs?: number;
  offlineAfterMs?: number;
  now?: () => number;
}

export interface JanitorHandle {
  stop(): void;
  tick(): void;
}

export function startJanitor(state: State, bus: Bus, opts: JanitorOptions = {}): JanitorHandle {
  const interval = opts.intervalMs ?? 30_000;
  const awayMs = opts.awayAfterMs ?? AWAY_AFTER_MS;
  const offlineMs = opts.offlineAfterMs ?? OFFLINE_AFTER_MS;
  const now = opts.now ?? (() => Date.now());

  function tick(): void {
    const t = now();

    for (const a of state.agentsToAway(t - awayMs)) {
      const updated = state.setAway(a.id);
      if (updated) {
        bus.publish({ type: 'agent', repoPath: updated.repoPath, agent: updated });
        const ev = state.addActivity({
          repoPath: updated.repoPath,
          kind: 'away',
          agentId: updated.id,
          body: updated.awayMessage,
        });
        bus.publish({ type: 'activity', repoPath: updated.repoPath, event: ev });
      }
    }

    for (const a of state.agentsToOffline(t - offlineMs)) {
      const updated = state.setOffline(a.id);
      if (updated) {
        bus.publish({ type: 'agent', repoPath: updated.repoPath, agent: updated });
        const ev = state.addActivity({
          repoPath: updated.repoPath,
          kind: 'offline',
          agentId: updated.id,
        });
        bus.publish({ type: 'activity', repoPath: updated.repoPath, event: ev });
      }
    }

    advanceQuestions(state, bus, t);
  }

  const timer = setInterval(tick, interval);
  return {
    stop(): void {
      clearInterval(timer);
    },
    tick,
  };
}
