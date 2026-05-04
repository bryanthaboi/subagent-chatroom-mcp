#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createServer } from './server.js';

const PORT = Number(process.env.AOL_PORT || 3312);
const HOST = process.env.AOL_HOST || '127.0.0.1';
const STATE_DIR = path.join(os.homedir(), '.aol');
const PID_FILE = path.join(STATE_DIR, 'daemon.pid');
const LOG_FILE = path.join(STATE_DIR, 'daemon.log');

function ensureStateDir(): void {
  fs.mkdirSync(STATE_DIR, { recursive: true });
}

function existingPid(): number | null {
  try {
    const raw = fs.readFileSync(PID_FILE, 'utf8').trim();
    const pid = Number(raw);
    if (!Number.isFinite(pid) || pid <= 0) return null;
    try {
      process.kill(pid, 0);
      return pid;
    } catch {
      return null;
    }
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  ensureStateDir();
  const running = existingPid();
  if (running) {
    console.error(`[aol] daemon already running (pid ${running}). Stop it first or use 'aol restart'.`);
    process.exit(2);
  }
  const { start, stop } = createServer({ port: PORT, host: HOST });
  await start();
  fs.writeFileSync(PID_FILE, String(process.pid), 'utf8');
  const logStream = fs.createWriteStream(LOG_FILE, { flags: 'a' });
  const log = (msg: string): void => {
    const line = `[${new Date().toISOString()}] ${msg}\n`;
    logStream.write(line);
    process.stdout.write(line);
  };
  log(`AOL daemon listening on http://${HOST}:${PORT}`);
  log(`PID file: ${PID_FILE}`);

  const shutdown = async (sig: string): Promise<void> => {
    log(`received ${sig}, shutting down`);
    await stop();
    try {
      fs.unlinkSync(PID_FILE);
    } catch {}
    logStream.end();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err) => {
  console.error('[aol] fatal:', err);
  process.exit(1);
});
