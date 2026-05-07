import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleApi, handleSse } from './routes.js';
import { State } from './state.js';
import { Bus } from './events.js';
import { startJanitor, type JanitorHandle } from './janitor.js';
import { makeThemesCache, makeResolveContext, type ThemesCache } from './themes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const PUBLIC_DIR = path.join(ROOT, 'public');

function bundledThemesDir(): string {
  return process.env.AOL_BUNDLED_THEMES_DIR ?? path.join(PUBLIC_DIR, 'themes');
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.jsx': 'text/babel; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
};

function safeJoin(base: string, relative: string): string | null {
  const resolved = path.resolve(base, '.' + relative);
  if (!resolved.startsWith(base)) return null;
  return resolved;
}

function serveBundledTheme(req: http.IncomingMessage, res: http.ServerResponse, url: URL): void {
  // /themes/bundled/<name>/<path...> → <bundledThemesDir>/<name>/<path...>
  const root = path.resolve(bundledThemesDir());
  const rel = decodeURIComponent(url.pathname.slice('/themes/bundled'.length));
  const filePath = path.resolve(root, '.' + rel);
  if (!filePath.startsWith(root + path.sep) && filePath !== root) {
    res.writeHead(403, { 'content-type': 'text/plain' });
    res.end('forbidden');
    return;
  }
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('not found');
    return;
  }
  const ext = path.extname(filePath).toLowerCase();
  const mime = MIME[ext] ?? 'application/octet-stream';
  res.writeHead(200, { 'content-type': mime, 'cache-control': 'no-store' });
  fs.createReadStream(filePath).pipe(res);
}

function serveExternalTheme(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: URL,
  state: { getSetting: (k: 'theme.externalDir') => string | null }
): void {
  const externalDir = state.getSetting('theme.externalDir');
  if (!externalDir) {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('external themes dir not configured');
    return;
  }
  const rel = decodeURIComponent(url.pathname.slice('/themes/external'.length));
  const root = path.resolve(externalDir);
  const filePath = path.resolve(root, '.' + rel);
  if (!filePath.startsWith(root + path.sep) && filePath !== root) {
    res.writeHead(403, { 'content-type': 'text/plain' });
    res.end('forbidden');
    return;
  }
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('not found');
    return;
  }
  const ext = path.extname(filePath).toLowerCase();
  const mime = MIME[ext] ?? 'application/octet-stream';
  res.writeHead(200, { 'content-type': mime, 'cache-control': 'no-store' });
  fs.createReadStream(filePath).pipe(res);
}

function serveStatic(req: http.IncomingMessage, res: http.ServerResponse, url: URL): void {
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === '/') pathname = '/index.html';
  const filePath = safeJoin(PUBLIC_DIR, pathname);
  if (!filePath || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('not found');
    return;
  }
  const ext = path.extname(filePath).toLowerCase();
  const mime = MIME[ext] ?? 'application/octet-stream';
  res.writeHead(200, {
    'content-type': mime,
    'cache-control': 'no-store',
  });
  fs.createReadStream(filePath).pipe(res);
}

export interface ServerOptions {
  port: number;
  host?: string;
  dbFilename?: string;
}

export interface CreatedServer {
  server: http.Server;
  state: State;
  bus: Bus;
  janitor: JanitorHandle;
  start: () => Promise<void>;
  stop: () => Promise<void>;
}

export function createServer(opts: ServerOptions): CreatedServer {
  const state = new State(opts.dbFilename);
  const bus = new Bus();
  bus.setMaxListeners(100);
  const janitor = startJanitor(state, bus);
  const themesCache = makeThemesCache({
    bundledDir: bundledThemesDir(),
    getExternalDir: () => state.getSetting('theme.externalDir'),
  });
  const resolveCtx = makeResolveContext();

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    if (url.pathname.startsWith('/api/')) {
      res.setHeader('access-control-allow-origin', '*');
      res.setHeader('access-control-allow-methods', 'GET,POST,DELETE,OPTIONS');
      res.setHeader('access-control-allow-headers', 'content-type');
      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }
    }
    if (url.pathname === '/api/events') return handleSse(req, res, url, bus);
    if (url.pathname.startsWith('/api/')) return handleApi(req, res, url, state, bus, themesCache, resolveCtx);
    if (url.pathname.startsWith('/themes/bundled/')) return serveBundledTheme(req, res, url);
    if (url.pathname.startsWith('/themes/external/')) return serveExternalTheme(req, res, url, state);
    serveStatic(req, res, url);
  });

  return {
    server,
    state,
    bus,
    janitor,
    start: () =>
      new Promise<void>((resolve, reject) => {
        server.once('error', reject);
        server.listen(opts.port, opts.host ?? '127.0.0.1', () => {
          server.off('error', reject);
          resolve();
        });
      }),
    stop: () =>
      new Promise<void>((resolve) => {
        janitor.stop();
        state.close();
        server.close(() => resolve());
      }),
  };
}
