import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { scanThemes, resolveTheme } from '../src/daemon/themes.js';

let tmp: string;
let bundledDir: string;

function writeTheme(
  root: string,
  name: string,
  manifest: any,
  opts: { withCss?: boolean; withShell?: boolean } = {}
) {
  const dir = path.join(root, name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'theme.json'), JSON.stringify(manifest, null, 2));
  if (opts.withCss !== false) fs.writeFileSync(path.join(dir, 'theme.css'), '/* test */');
  if (opts.withShell) fs.writeFileSync(path.join(dir, 'Shell.jsx'), '// shell');
}

const valid = (over: Partial<any> = {}) => ({
  name: 'aol',
  displayName: 'AOL',
  version: '1.0.0',
  extends: null,
  layout: 'multiwindow',
  css: 'theme.css',
  compatVersion: 1,
  ...over,
});

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aol-themes-test-'));
  bundledDir = path.join(tmp, 'bundled');
  fs.mkdirSync(bundledDir, { recursive: true });
});
afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('scanThemes', () => {
  it('finds a valid bundled theme', () => {
    writeTheme(bundledDir, 'aol', valid());
    const result = scanThemes({ bundledDir, externalDir: null });
    expect(result.length).toBe(1);
    expect(result[0].valid).toBe(true);
    expect(result[0].source).toBe('bundled');
    expect(result[0].name).toBe('aol');
  });

  it('finds external themes when externalDir is set', () => {
    const ext = path.join(tmp, 'external');
    fs.mkdirSync(ext, { recursive: true });
    writeTheme(bundledDir, 'aol', valid());
    writeTheme(ext, 'discord', valid({ name: 'discord' }));
    const result = scanThemes({ bundledDir, externalDir: ext });
    expect(result.length).toBe(2);
    const ds = result.find((r) => r.name === 'discord')!;
    expect(ds.valid).toBe(true);
    expect(ds.source).toBe('external');
  });

  it('skips non-existent externalDir without error', () => {
    writeTheme(bundledDir, 'aol', valid());
    const result = scanThemes({ bundledDir, externalDir: '/nonexistent/path/zzz' });
    expect(result.length).toBe(1);
    expect(result[0].source).toBe('bundled');
  });

  it('marks invalid: bad JSON', () => {
    const dir = path.join(bundledDir, 'broke');
    fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, 'theme.json'), '{ not json');
    const r = scanThemes({ bundledDir, externalDir: null });
    expect(r[0].valid).toBe(false);
    expect(r[0].invalidReason).toMatch(/json/i);
  });

  it('marks invalid: name/dir mismatch', () => {
    writeTheme(bundledDir, 'foo', valid({ name: 'bar' }));
    const r = scanThemes({ bundledDir, externalDir: null });
    expect(r[0].valid).toBe(false);
    expect(r[0].invalidReason).toMatch(/name.*dir/i);
  });

  it('marks invalid: missing CSS file', () => {
    writeTheme(bundledDir, 'aol', valid(), { withCss: false });
    const r = scanThemes({ bundledDir, externalDir: null });
    expect(r[0].valid).toBe(false);
    expect(r[0].invalidReason).toMatch(/css/i);
  });

  it('marks invalid: shell referenced but missing', () => {
    writeTheme(bundledDir, 'aol', valid({ shell: 'Shell.jsx' }));
    const r = scanThemes({ bundledDir, externalDir: null });
    expect(r[0].valid).toBe(false);
    expect(r[0].invalidReason).toMatch(/shell/i);
  });

  it('marks invalid: compatVersion mismatch', () => {
    writeTheme(bundledDir, 'aol', valid({ compatVersion: 99 }));
    const r = scanThemes({ bundledDir, externalDir: null });
    expect(r[0].valid).toBe(false);
    expect(r[0].invalidReason).toMatch(/compat/i);
  });

  it('marks invalid: extends to unknown', () => {
    writeTheme(bundledDir, 'child', valid({ name: 'child', extends: 'nope' }));
    const r = scanThemes({ bundledDir, externalDir: null });
    const c = r.find((x) => x.name === 'child')!;
    expect(c.valid).toBe(false);
    expect(c.invalidReason).toMatch(/extends/i);
  });

  it('marks invalid: chained extends', () => {
    writeTheme(bundledDir, 'a', valid({ name: 'a' }));
    writeTheme(bundledDir, 'b', valid({ name: 'b', extends: 'a' }));
    writeTheme(bundledDir, 'c', valid({ name: 'c', extends: 'b' }));
    const r = scanThemes({ bundledDir, externalDir: null });
    const c = r.find((x) => x.name === 'c')!;
    expect(c.valid).toBe(false);
    expect(c.invalidReason).toMatch(/chain/i);
  });

  it('on bundled/external collision, bundled wins', () => {
    const ext = path.join(tmp, 'external');
    fs.mkdirSync(ext, { recursive: true });
    writeTheme(bundledDir, 'aol', valid());
    writeTheme(ext, 'aol', valid());
    const r = scanThemes({ bundledDir, externalDir: ext });
    const bundled = r.find((x) => x.source === 'bundled')!;
    const external = r.find((x) => x.source === 'external')!;
    expect(bundled.valid).toBe(true);
    expect(external.valid).toBe(false);
    expect(external.invalidReason).toMatch(/collision/i);
  });
});

const ctx = {
  publicBundledUrlBase: '/themes/bundled',
  publicExternalUrlBase: '/themes/external',
  fallbackShellUrl: '/fallback-shell.jsx',
  defaultAudio: {
    signon: '/themes/bundled/aol/assets/dooropen.wav',
    imRecv: '/themes/bundled/aol/assets/imrcv.wav',
  },
};

describe('resolveTheme', () => {
  it('resolves a no-extends theme', () => {
    writeTheme(bundledDir, 'aol', valid({ shell: 'Shell.jsx' }), { withShell: true });
    const themes = scanThemes({ bundledDir, externalDir: null });
    const r = resolveTheme('aol', themes, ctx);
    expect(r.active.name).toBe('aol');
    expect(r.base).toBeNull();
    expect(r.active.cssUrls).toEqual(['/themes/bundled/aol/theme.css']);
    expect(r.active.shellUrl).toBe('/themes/bundled/aol/Shell.jsx');
    expect(r.active.audio.signon).toBe('/themes/bundled/aol/assets/dooropen.wav');
  });

  it('resolves an extending theme — base CSS first', () => {
    writeTheme(bundledDir, 'aol', valid({ shell: 'Shell.jsx' }), { withShell: true });
    writeTheme(bundledDir, 'pinkaol', valid({ name: 'pinkaol', displayName: 'Pink AOL', extends: 'aol' }));
    const themes = scanThemes({ bundledDir, externalDir: null });
    const r = resolveTheme('pinkaol', themes, ctx);
    expect(r.base?.name).toBe('aol');
    expect(r.active.cssUrls).toEqual([
      '/themes/bundled/aol/theme.css',
      '/themes/bundled/pinkaol/theme.css',
    ]);
    expect(r.active.shellUrl).toBe('/themes/bundled/aol/Shell.jsx');
  });

  it('falls back when active theme is invalid', () => {
    const themes = scanThemes({ bundledDir, externalDir: null });
    const r = resolveTheme('ghost', themes, ctx);
    expect(r.active.name).toBe('__fallback__');
    expect(r.active.shellUrl).toBe('/fallback-shell.jsx');
    expect(r.warnings.length).toBeGreaterThan(0);
  });

  it('merges audio overrides into defaults', () => {
    writeTheme(bundledDir, 'aol', valid({
      audio: { signon: 'assets/custom.wav' },
    }));
    fs.mkdirSync(path.join(bundledDir, 'aol', 'assets'));
    fs.writeFileSync(path.join(bundledDir, 'aol', 'assets', 'custom.wav'), '');
    const themes = scanThemes({ bundledDir, externalDir: null });
    const r = resolveTheme('aol', themes, ctx);
    expect(r.active.audio.signon).toBe('/themes/bundled/aol/assets/custom.wav');
    expect(r.active.audio.imRecv).toBe('/themes/bundled/aol/assets/imrcv.wav'); // default kept
  });
});
