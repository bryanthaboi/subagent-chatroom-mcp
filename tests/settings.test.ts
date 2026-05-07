import { describe, it, expect } from 'vitest';
import { State } from '../src/daemon/state.js';
import { DEFAULT_SETTINGS } from '../src/shared/types.js';
import { createServer } from '../src/daemon/server.js';
import type { AddressInfo } from 'node:net';

describe('Settings', () => {
  it('returns defaults on a fresh DB', () => {
    const s = new State(':memory:');
    expect(s.getAllSettings()).toEqual(DEFAULT_SETTINGS);
    s.close();
  });

  it('reads a single setting', () => {
    const s = new State(':memory:');
    expect(s.getSetting('theme.active')).toBe('aol');
    expect(s.getSetting('audio.enabled')).toBe(true);
    expect(s.getSetting('theme.externalDir')).toBeNull();
    s.close();
  });

  it('round-trips a patch via setSettings', () => {
    const s = new State(':memory:');
    const next = s.setSettings({
      'theme.active': 'discord',
      'audio.enabled': false,
    });
    expect(next['theme.active']).toBe('discord');
    expect(next['audio.enabled']).toBe(false);
    expect(next['theme.externalDir']).toBeNull(); // unchanged
    expect(next['debug.devlog']).toBe(false); // default

    expect(s.getSetting('theme.active')).toBe('discord');
    s.close();
  });

  it('sets externalDir to a string and back to null', () => {
    const s = new State(':memory:');
    s.setSettings({ 'theme.externalDir': '/tmp/themes' });
    expect(s.getSetting('theme.externalDir')).toBe('/tmp/themes');
    s.setSettings({ 'theme.externalDir': null });
    expect(s.getSetting('theme.externalDir')).toBeNull();
    s.close();
  });
});

async function withServer<T>(fn: (baseUrl: string) => Promise<T>): Promise<T> {
  const inst = createServer({ port: 0, dbFilename: ':memory:' });
  await inst.start();
  const port = (inst.server.address() as AddressInfo).port;
  try {
    return await fn(`http://127.0.0.1:${port}`);
  } finally {
    await inst.stop();
  }
}

describe('Settings HTTP', () => {
  it('GET /api/settings returns defaults on a fresh DB', async () => {
    await withServer(async (base) => {
      const r = await fetch(base + '/api/settings');
      expect(r.status).toBe(200);
      const body = await r.json();
      expect(body).toEqual(DEFAULT_SETTINGS);
    });
  });

  it('POST /api/settings merge-patches', async () => {
    await withServer(async (base) => {
      const r = await fetch(base + '/api/settings', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ 'audio.enabled': false }),
      });
      expect(r.status).toBe(200);
      const body = await r.json();
      expect(body['audio.enabled']).toBe(false);
      expect(body['theme.active']).toBe('aol');
    });
  });

  it('rejects unknown setting keys', async () => {
    await withServer(async (base) => {
      const r = await fetch(base + '/api/settings', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ 'unknown.key': 'x' }),
      });
      expect(r.status).toBe(400);
    });
  });

  it('SSE emits settings event on patch', async () => {
    await withServer(async (base) => {
      const got: any[] = [];
      const ac = new AbortController();
      const sse = fetch(base + '/api/events', { signal: ac.signal }).then(async (r) => {
        const reader = r.body!.getReader();
        const dec = new TextDecoder();
        let buf = '';
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += dec.decode(value);
          let idx;
          while ((idx = buf.indexOf('\n\n')) !== -1) {
            const block = buf.slice(0, idx);
            buf = buf.slice(idx + 2);
            for (const line of block.split('\n')) {
              if (line.startsWith('data: ')) {
                try { got.push(JSON.parse(line.slice(6))); } catch {}
              }
            }
          }
        }
      }).catch(() => {});
      await new Promise((r) => setTimeout(r, 50));
      await fetch(base + '/api/settings', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ 'audio.enabled': false }),
      });
      await new Promise((r) => setTimeout(r, 100));
      ac.abort();
      await sse;
      const ev = got.find((e) => e.type === 'settings');
      expect(ev).toBeTruthy();
      expect(ev.settings['audio.enabled']).toBe(false);
    });
  });
});
