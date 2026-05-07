import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createServer } from '../src/daemon/server.js';
import type { AddressInfo } from 'node:net';

let tmp: string;
let baseUrl: string;
let stop: () => Promise<void>;

beforeEach(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aol-routes-test-'));
  process.env.AOL_BUNDLED_THEMES_DIR = path.join(tmp, 'bundled');
  fs.mkdirSync(process.env.AOL_BUNDLED_THEMES_DIR, { recursive: true });

  const aolDir = path.join(process.env.AOL_BUNDLED_THEMES_DIR, 'aol');
  fs.mkdirSync(aolDir);
  fs.writeFileSync(
    path.join(aolDir, 'theme.json'),
    JSON.stringify({
      name: 'aol',
      displayName: 'AOL',
      version: '1.0.0',
      extends: null,
      layout: 'multiwindow',
      css: 'theme.css',
      compatVersion: 1,
    })
  );
  fs.writeFileSync(path.join(aolDir, 'theme.css'), '/*aol*/');

  const inst = createServer({ port: 0, dbFilename: ':memory:' });
  await inst.start();
  const port = (inst.server.address() as AddressInfo).port;
  baseUrl = `http://127.0.0.1:${port}`;
  stop = inst.stop;
});

afterEach(async () => {
  await stop();
  delete process.env.AOL_BUNDLED_THEMES_DIR;
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('Theme routes', () => {
  it('GET /api/themes lists bundled themes', async () => {
    const r = await fetch(baseUrl + '/api/themes');
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(Array.isArray(body.themes)).toBe(true);
    const aol = body.themes.find((t: any) => t.name === 'aol');
    expect(aol).toBeTruthy();
    expect(aol.valid).toBe(true);
    expect(aol.source).toBe('bundled');
  });

  it('GET /api/themes/:name/resolved returns boot payload', async () => {
    const r = await fetch(baseUrl + '/api/themes/aol/resolved');
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.active.name).toBe('aol');
    expect(body.active.cssUrls).toEqual(['/themes/bundled/aol/theme.css']);
  });

  it('GET /api/themes/:unknown/resolved returns fallback payload (200)', async () => {
    const r = await fetch(baseUrl + '/api/themes/missing/resolved');
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.active.name).toBe('__fallback__');
    expect(body.warnings.length).toBeGreaterThan(0);
  });

  it('changing externalDir invalidates the cache', async () => {
    const ext = path.join(tmp, 'external');
    fs.mkdirSync(ext);
    const dDir = path.join(ext, 'discord');
    fs.mkdirSync(dDir);
    fs.writeFileSync(
      path.join(dDir, 'theme.json'),
      JSON.stringify({
        name: 'discord',
        displayName: 'Discord',
        version: '1.0.0',
        extends: null,
        layout: 'singlewindow',
        css: 'theme.css',
        compatVersion: 1,
      })
    );
    fs.writeFileSync(path.join(dDir, 'theme.css'), '/*d*/');

    let r = await fetch(baseUrl + '/api/themes');
    expect((await r.json()).themes.length).toBe(1);

    await fetch(baseUrl + '/api/settings', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ 'theme.externalDir': ext }),
    });

    r = await fetch(baseUrl + '/api/themes');
    const list = (await r.json()).themes;
    expect(list.find((t: any) => t.name === 'discord')).toBeTruthy();
  });
});

describe('/themes/external static', () => {
  it('serves a CSS file from external dir', async () => {
    const ext = path.join(tmp, 'external');
    fs.mkdirSync(ext);
    const t = path.join(ext, 'mytheme');
    fs.mkdirSync(t);
    fs.writeFileSync(
      path.join(t, 'theme.json'),
      JSON.stringify({
        name: 'mytheme',
        displayName: 'My',
        version: '1.0.0',
        extends: null,
        layout: 'multiwindow',
        css: 'theme.css',
        compatVersion: 1,
      })
    );
    fs.writeFileSync(path.join(t, 'theme.css'), '/* my css */');
    await fetch(baseUrl + '/api/settings', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ 'theme.externalDir': ext }),
    });
    const r = await fetch(baseUrl + '/themes/external/mytheme/theme.css');
    expect(r.status).toBe(200);
    expect(await r.text()).toContain('/* my css */');
  });

  it('rejects path traversal', async () => {
    const ext = path.join(tmp, 'external');
    fs.mkdirSync(ext);
    await fetch(baseUrl + '/api/settings', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ 'theme.externalDir': ext }),
    });
    const r = await fetch(baseUrl + '/themes/external/..%2F..%2Fetc%2Fpasswd');
    expect([403, 404]).toContain(r.status);
  });

  it('returns 404 when externalDir is null', async () => {
    const r = await fetch(baseUrl + '/themes/external/anything/theme.css');
    expect(r.status).toBe(404);
  });
});
