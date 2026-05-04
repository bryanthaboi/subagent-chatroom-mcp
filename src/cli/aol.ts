#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { AolClient } from '../shared/client.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const STATE_DIR = path.join(os.homedir(), '.aol');
const PID_FILE = path.join(STATE_DIR, 'daemon.pid');
const LOG_FILE = path.join(STATE_DIR, 'daemon.log');

function ensureStateDir(): void {
  fs.mkdirSync(STATE_DIR, { recursive: true });
}

function readPid(): number | null {
  try {
    const raw = fs.readFileSync(PID_FILE, 'utf8').trim();
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) return null;
    try {
      process.kill(n, 0);
      return n;
    } catch {
      return null;
    }
  } catch {
    return null;
  }
}

function clearPid(): void {
  try {
    fs.unlinkSync(PID_FILE);
  } catch {}
}

function daemonEntry(): { cmd: string; args: string[] } {
  const builtEntry = path.join(ROOT, 'dist', 'daemon', 'index.js');
  const srcEntry = path.join(ROOT, 'src', 'daemon', 'index.ts');
  if (fs.existsSync(builtEntry)) return { cmd: process.execPath, args: [builtEntry] };
  const tsxBin = path.join(ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs');
  if (!fs.existsSync(tsxBin)) {
    throw new Error('Daemon not built and tsx not installed. Run `pnpm build` first.');
  }
  return { cmd: process.execPath, args: [tsxBin, srcEntry] };
}

async function cmdStart(args: string[]): Promise<void> {
  ensureStateDir();
  const detach = args.includes('--detach') || args.includes('-d');
  const pid = readPid();
  if (pid) {
    console.log(`[aol] daemon already running (pid ${pid})`);
    return;
  }
  const { cmd, args: dargs } = daemonEntry();
  if (detach) {
    const out = fs.openSync(LOG_FILE, 'a');
    const err = fs.openSync(LOG_FILE, 'a');
    const child = spawn(cmd, dargs, {
      detached: true,
      stdio: ['ignore', out, err],
      env: process.env,
    });
    child.unref();
    // wait for health
    const client = new AolClient({ autospawn: false });
    const deadline = Date.now() + 8000;
    while (Date.now() < deadline) {
      if (await client.health()) {
        console.log(`[aol] daemon started (pid ${child.pid})`);
        return;
      }
      await new Promise((r) => setTimeout(r, 200));
    }
    console.error('[aol] daemon did not become healthy in 8s; check ~/.aol/daemon.log');
    process.exit(1);
  } else {
    const child = spawn(cmd, dargs, { stdio: 'inherit', env: process.env });
    child.on('exit', (code) => process.exit(code ?? 0));
  }
}

async function cmdStop(): Promise<void> {
  const pid = readPid();
  if (!pid) {
    console.log('[aol] not running');
    return;
  }
  try {
    process.kill(pid, 'SIGTERM');
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      try {
        process.kill(pid, 0);
      } catch {
        clearPid();
        console.log('[aol] stopped');
        return;
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    console.error(`[aol] pid ${pid} did not exit; try \`aol kill\``);
    process.exit(1);
  } catch (e: any) {
    console.error('[aol] stop failed:', e.message);
    clearPid();
    process.exit(1);
  }
}

async function cmdKill(): Promise<void> {
  const pid = readPid();
  if (!pid) {
    console.log('[aol] not running');
    return;
  }
  try {
    process.kill(pid, 'SIGKILL');
  } catch {}
  clearPid();
  console.log(`[aol] killed pid ${pid}`);
}

async function cmdStatus(): Promise<void> {
  const pid = readPid();
  const client = new AolClient({ autospawn: false });
  const healthy = await client.health();
  const port = process.env.AOL_PORT || '3312';
  console.log(`pid=${pid ?? '-'} healthy=${healthy} port=${port}`);
  if (healthy) {
    const repos = await client.listRepos().catch(() => ({ repos: [] }));
    console.log(`repos=${(repos.repos || []).length}`);
  }
}

async function cmdRestart(): Promise<void> {
  await cmdStop();
  await cmdStart(['--detach']);
}

async function cmdInstallSkills(args: string[]): Promise<void> {
  const targets: string[] = [];
  let force = false;
  let dryRun = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--skills') {
      const v = args[++i];
      if (!v) {
        console.error('--skills requires a path');
        process.exit(2);
      }
      targets.push(v);
    } else if (a === '--force') force = true;
    else if (a === '--dry-run') dryRun = true;
    else {
      console.error(`unknown arg: ${a}`);
      process.exit(2);
    }
  }
  if (!targets.length) {
    console.error('install-skills: pass --skills <dir> at least once');
    process.exit(2);
  }
  const srcDir = path.join(ROOT, 'skills', 'aol-coordination');
  if (!fs.existsSync(srcDir)) {
    console.error(`skills source missing: ${srcDir}`);
    process.exit(1);
  }
  for (const raw of targets) {
    const dst = raw.startsWith('~') ? path.join(os.homedir(), raw.slice(1)) : path.resolve(raw);
    if (dryRun) console.log(`[dry-run] would copy ${srcDir} -> ${dst}`);
    else {
      fs.mkdirSync(dst, { recursive: true });
      copyDir(srcDir, dst, force);
      console.log(`installed -> ${dst}`);
    }
  }
}

function copyDir(src: string, dst: string, force: boolean): void {
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dst, entry.name);
    if (entry.isDirectory()) {
      fs.mkdirSync(d, { recursive: true });
      copyDir(s, d, force);
    } else {
      if (fs.existsSync(d) && !force) {
        // overwrite only AOL-managed filenames; SKILL.md is the canonical AOL file
        const isAolManaged = entry.name === 'SKILL.md' || entry.name.startsWith('aol-');
        if (!isAolManaged) {
          console.log(`skip (exists, not AOL-managed): ${d}`);
          continue;
        }
      }
      fs.copyFileSync(s, d);
    }
  }
}

async function cmdAgent(args: string[]): Promise<void> {
  // Lightweight wrapper for subagents to act via Bash.
  // Usage examples:
  //   aol agent register --id A --name A --repo /path
  //   aol agent claim --id A --file foo.ts --reason "..." --mode edit
  //   aol agent release --claim CLAIMID --summary "..."
  //   aol agent room --id A --repo /path --body "hello"
  //   aol agent dm --from A --to B --repo /path --body "hi"
  //   aol agent status --id A --status editing --file foo.ts --reason ...
  //   aol agent wait --id A --repo /path --file foo.ts --timeout 30000
  //   aol agent claims --repo /path
  //   aol agent messages --repo /path [--peer X --id A]
  //   aol agent activity --repo /path [--limit 50]
  //   aol agent agents --repo /path
  //   aol agent repos
  //   aol agent offline --id A
  //   aol agent started/completed/abandoned --id A [--file foo.ts] [--summary "..."]
  const sub = args.shift();
  const flags = parseFlags(args);
  const c = new AolClient();
  const out = (v: unknown): void => {
    console.log(JSON.stringify(v, null, 2));
  };
  try {
    switch (sub) {
      case 'register':
        out(
          await c.registerAgent({
            id: flags.id,
            name: flags.name || flags.id || 'agent',
            repoPath: required(flags.repo, '--repo'),
            color: flags.color,
          })
        );
        return;
      case 'offline':
        out(await c.setOffline(required(flags.id, '--id')));
        return;
      case 'status':
        out(
          await c.setStatus(required(flags.id, '--id'), {
            status: required(flags.status, '--status'),
            currentFile: flags.file,
            reason: flags.reason,
            waitingOn: flags.waitingOn,
          })
        );
        return;
      case 'claim':
        try {
          out(
            await c.claimFile({
              agentId: required(flags.id, '--id'),
              file: required(flags.file, '--file'),
              mode: flags.mode === 'review' ? 'review' : 'edit',
              reason: required(flags.reason, '--reason'),
            })
          );
        } catch (e: any) {
          if (e.status === 409) {
            out({ ok: false, conflict: e.conflict });
            process.exit(0);
          }
          throw e;
        }
        return;
      case 'release':
        out(await c.releaseFile(required(flags.claim, '--claim'), flags.summary));
        return;
      case 'inspect':
        out(await c.inspectClaim(required(flags.claim, '--claim')));
        return;
      case 'claims':
        out(await c.listClaims({ repoPath: flags.repo, activeOnly: flags.all !== 'true' }));
        return;
      case 'room':
        out(
          await c.sendMessage({
            from: required(flags.id, '--id'),
            repoPath: required(flags.repo, '--repo'),
            body: required(flags.body, '--body'),
          })
        );
        return;
      case 'dm':
        out(
          await c.sendMessage({
            from: required(flags.from, '--from'),
            to: required(flags.to, '--to'),
            repoPath: required(flags.repo, '--repo'),
            body: required(flags.body, '--body'),
          })
        );
        return;
      case 'messages':
        out(
          await c.getMessages({
            repoPath: required(flags.repo, '--repo'),
            since: flags.since ? Number(flags.since) : undefined,
            peer: flags.peer,
            agentId: flags.id,
          })
        );
        return;
      case 'activity':
        out(
          await c.getActivity({
            repoPath: flags.repo,
            since: flags.since ? Number(flags.since) : undefined,
            limit: flags.limit ? Number(flags.limit) : undefined,
          })
        );
        return;
      case 'agents':
        out(await c.listAgents(flags.repo));
        return;
      case 'repos':
        out(await c.listRepos());
        return;
      case 'wait':
        out(
          await c.waitForRelease({
            agentId: required(flags.id, '--id'),
            repoPath: required(flags.repo, '--repo'),
            file: required(flags.file, '--file'),
            timeoutMs: flags.timeout ? Number(flags.timeout) : 30000,
          })
        );
        return;
      case 'started':
        out(await c.markStarted(required(flags.id, '--id'), { file: flags.file, summary: flags.summary }));
        return;
      case 'completed':
        out(await c.markCompleted(required(flags.id, '--id'), { file: flags.file, summary: flags.summary }));
        return;
      case 'abandoned':
        out(await c.markAbandoned(required(flags.id, '--id'), { file: flags.file, summary: flags.summary }));
        return;
      default:
        console.error(`unknown subcommand: ${sub}`);
        process.exit(2);
    }
  } catch (e: any) {
    console.error('[aol agent] error:', e?.message || e);
    if (e?.body) console.error(JSON.stringify(e.body));
    process.exit(1);
  }
}

function parseFlags(args: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = args[i + 1];
      if (next === undefined || next.startsWith('--')) {
        out[key] = 'true';
      } else {
        out[key] = next;
        i++;
      }
    }
  }
  return out;
}

function required<T>(v: T | undefined, name: string): T {
  if (v === undefined || v === null || v === '') {
    console.error(`missing required flag: ${name}`);
    process.exit(2);
  }
  return v;
}

function help(): void {
  console.log(`AOL — Agents On Line
Usage:
  aol start [--detach]      Start the daemon
  aol stop                  Graceful stop (SIGTERM)
  aol kill                  Force kill (SIGKILL)
  aol restart
  aol status                Show pid + health
  aol install-skills --skills <dir> [--skills <dir>...] [--force] [--dry-run]
  aol agent <subcommand> [flags]   See README/DEPLOY.md for the full subcommand list
  aol mcp                   Run the stdio MCP server (foreground)
`);
}

async function cmdMcp(): Promise<void> {
  const builtMcp = path.join(ROOT, 'dist', 'mcp', 'index.js');
  const srcMcp = path.join(ROOT, 'src', 'mcp', 'index.ts');
  let cmd = process.execPath;
  let args: string[];
  if (fs.existsSync(builtMcp)) args = [builtMcp];
  else {
    const tsxBin = path.join(ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs');
    args = [tsxBin, srcMcp];
  }
  const r = spawnSync(cmd, args, { stdio: 'inherit', env: process.env });
  process.exit(r.status ?? 0);
}

async function main(): Promise<void> {
  const [, , sub, ...rest] = process.argv;
  switch (sub) {
    case 'start':
      return cmdStart(rest);
    case 'stop':
      return cmdStop();
    case 'kill':
      return cmdKill();
    case 'restart':
      return cmdRestart();
    case 'status':
      return cmdStatus();
    case 'install-skills':
      return cmdInstallSkills(rest);
    case 'agent':
      return cmdAgent(rest);
    case 'mcp':
      return cmdMcp();
    case 'help':
    case '--help':
    case '-h':
    case undefined:
      return help();
    default:
      console.error(`unknown command: ${sub}`);
      help();
      process.exit(2);
  }
}

main().catch((err) => {
  console.error('[aol] fatal:', err);
  process.exit(1);
});
