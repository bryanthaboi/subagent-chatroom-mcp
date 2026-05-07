import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import type { DiscoveredTheme, ResolvedTheme, ThemeManifest, ThemeSource } from '../shared/types.js';
import { THEME_COMPAT_VERSION } from '../shared/types.js';

const ManifestSchema = z.object({
  name: z.string().min(1),
  displayName: z.string().min(1),
  version: z.string().min(1),
  author: z.string().optional(),
  description: z.string().optional(),
  extends: z.string().nullable(),
  layout: z.enum(['multiwindow', 'singlewindow']),
  css: z.string().min(1),
  shell: z.string().optional(),
  assets: z.string().optional(),
  audio: z.record(z.string(), z.string()).optional(),
  compatVersion: z.number().int(),
});

interface RawTheme {
  name: string;
  source: ThemeSource;
  dir: string;
  manifestRaw?: ThemeManifest;
  manifestParseError?: string;
  cssExists: boolean;
  shellExists: boolean | null;
}

function readDir(dir: string): RawTheme[] {
  if (!fs.existsSync(dir)) return [];
  const entries: RawTheme[] = [];
  for (const name of fs.readdirSync(dir)) {
    const themeDir = path.join(dir, name);
    if (!fs.statSync(themeDir).isDirectory()) continue;
    const jsonPath = path.join(themeDir, 'theme.json');
    if (!fs.existsSync(jsonPath)) continue;
    const raw: RawTheme = {
      name,
      source: 'bundled',
      dir: themeDir,
      cssExists: false,
      shellExists: null,
    };
    try {
      const parsed = ManifestSchema.parse(JSON.parse(fs.readFileSync(jsonPath, 'utf8')));
      raw.manifestRaw = parsed as ThemeManifest;
      raw.cssExists = fs.existsSync(path.join(themeDir, parsed.css));
      raw.shellExists = parsed.shell ? fs.existsSync(path.join(themeDir, parsed.shell)) : null;
    } catch (e: any) {
      raw.manifestParseError = e?.message ?? String(e);
    }
    entries.push(raw);
  }
  return entries;
}

export interface ScanOptions {
  bundledDir: string;
  externalDir: string | null;
}

export function scanThemes(opts: ScanOptions): DiscoveredTheme[] {
  const bundled = readDir(opts.bundledDir).map((r) => ({ ...r, source: 'bundled' as const }));
  const external = opts.externalDir
    ? readDir(opts.externalDir).map((r) => ({ ...r, source: 'external' as const }))
    : [];

  const bundledNames = new Set(bundled.map((r) => r.name));

  function intrinsicReason(r: RawTheme): string | null {
    if (r.manifestParseError) return `invalid theme.json: ${r.manifestParseError}`;
    const m = r.manifestRaw!;
    if (m.name !== r.name) return `manifest name (${m.name}) does not match dir name (${r.name})`;
    if (!r.cssExists) return `css file ${m.css} not found`;
    if (m.shell && r.shellExists === false) return `shell file ${m.shell} not found`;
    if (m.compatVersion !== THEME_COMPAT_VERSION) {
      return `incompatible theme (compat v${m.compatVersion}, app v${THEME_COMPAT_VERSION})`;
    }
    return null;
  }

  function collisionReason(r: RawTheme): string | null {
    if (r.source === 'external' && bundledNames.has(r.name)) {
      return 'name collision with bundled theme';
    }
    return null;
  }

  const all = [...bundled, ...external];
  const phase1: DiscoveredTheme[] = all.map((r) => {
    const reason = intrinsicReason(r) ?? collisionReason(r);
    if (reason) {
      return {
        name: r.name,
        source: r.source,
        dir: r.dir,
        manifest: r.manifestRaw ?? ({} as ThemeManifest),
        valid: false,
        invalidReason: reason,
      };
    }
    return {
      name: r.name,
      source: r.source,
      dir: r.dir,
      manifest: r.manifestRaw!,
      valid: true,
    };
  });

  const validByName = new Map<string, DiscoveredTheme>();
  for (const t of phase1) if (t.valid) validByName.set(t.name, t);

  return phase1.map((t) => {
    if (!t.valid) return t;
    const ext = t.manifest.extends;
    if (!ext) return t;
    const base = validByName.get(ext);
    if (!base) {
      return { ...t, valid: false, invalidReason: `extends "${ext}" but it is not a valid theme` };
    }
    if (base.manifest.extends !== null) {
      return {
        ...t,
        valid: false,
        invalidReason: `extends "${ext}" forms a chain (extends must be one level deep)`,
      };
    }
    return t;
  });
}

export interface ResolveContext {
  publicBundledUrlBase: string;
  publicExternalUrlBase: string;
  fallbackShellUrl: string;
  defaultAudio: Record<string, string>;
}

export interface ThemesCache {
  get(): DiscoveredTheme[];
  invalidate(): void;
}

const TTL_MS = 30_000;

export interface ThemesCacheDeps {
  bundledDir: string;
  getExternalDir: () => string | null;
}

export function makeThemesCache(deps: ThemesCacheDeps): ThemesCache {
  let cache: { themes: DiscoveredTheme[]; scannedAt: number } | null = null;
  let lastDir: string | null | undefined = undefined;
  return {
    get(): DiscoveredTheme[] {
      const externalDir = deps.getExternalDir();
      if (cache && externalDir === lastDir && Date.now() - cache.scannedAt < TTL_MS) {
        return cache.themes;
      }
      const themes = scanThemes({ bundledDir: deps.bundledDir, externalDir });
      cache = { themes, scannedAt: Date.now() };
      lastDir = externalDir;
      return themes;
    },
    invalidate(): void {
      cache = null;
    },
  };
}

export function makeResolveContext(): ResolveContext {
  return {
    publicBundledUrlBase: '/themes/bundled',
    publicExternalUrlBase: '/themes/external',
    fallbackShellUrl: '/fallback-shell.jsx',
    defaultAudio: {
      signon: '/themes/bundled/aol/assets/dooropen.wav',
      signoff: '/themes/bundled/aol/assets/doorslam.wav',
      imRecv: '/themes/bundled/aol/assets/imrcv.wav',
      imSend: '/themes/bundled/aol/assets/imsend.wav',
      welcome: '/themes/bundled/aol/assets/welcome.wav',
    },
  };
}

function urlBase(t: DiscoveredTheme, ctx: ResolveContext): string {
  return (t.source === 'bundled' ? ctx.publicBundledUrlBase : ctx.publicExternalUrlBase) + '/' + t.name;
}

export function resolveTheme(
  name: string,
  themes: DiscoveredTheme[],
  ctx: ResolveContext
): ResolvedTheme {
  const warnings: string[] = [];
  const validByName = new Map<string, DiscoveredTheme>();
  for (const t of themes) if (t.valid) validByName.set(t.name, t);

  const active = validByName.get(name);
  if (!active) {
    warnings.push(`theme "${name}" not found or invalid; using fallback`);
    return {
      active: {
        name: '__fallback__',
        source: 'bundled',
        cssUrls: [],
        shellUrl: ctx.fallbackShellUrl,
        audio: ctx.defaultAudio,
        manifest: {
          name: '__fallback__',
          displayName: 'Fallback',
          version: '0.0.0',
          extends: null,
          layout: 'multiwindow',
          css: '',
          compatVersion: THEME_COMPAT_VERSION,
        } as ThemeManifest,
      },
      base: null,
      warnings,
    };
  }

  const base = active.manifest.extends ? validByName.get(active.manifest.extends) ?? null : null;

  const cssUrls: string[] = [];
  if (base) cssUrls.push(urlBase(base, ctx) + '/' + base.manifest.css);
  cssUrls.push(urlBase(active, ctx) + '/' + active.manifest.css);

  let shellUrl: string;
  if (active.manifest.shell) {
    shellUrl = urlBase(active, ctx) + '/' + active.manifest.shell;
  } else if (base?.manifest.shell) {
    shellUrl = urlBase(base, ctx) + '/' + base.manifest.shell;
  } else {
    shellUrl = ctx.fallbackShellUrl;
  }

  const audio: Record<string, string> = { ...ctx.defaultAudio };
  if (active.manifest.audio) {
    for (const [k, v] of Object.entries(active.manifest.audio)) {
      audio[k] = urlBase(active, ctx) + '/' + v;
    }
  }

  return {
    active: {
      name: active.name,
      source: active.source,
      cssUrls,
      shellUrl,
      audio,
      manifest: active.manifest,
    },
    base: base ? { name: base.name, source: base.source } : null,
    warnings,
  };
}
