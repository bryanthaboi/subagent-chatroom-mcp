import Database from 'better-sqlite3';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  repo_path TEXT NOT NULL,
  status TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'agent',
  color TEXT NOT NULL,
  current_file TEXT,
  reason TEXT,
  waiting_on TEXT,
  away_message TEXT,
  away_since INTEGER,
  signed_off_at INTEGER,
  created_at INTEGER NOT NULL,
  last_seen INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS agents_repo ON agents(repo_path);
CREATE INDEX IF NOT EXISTS agents_status ON agents(status);

CREATE TABLE IF NOT EXISTS claims (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  agent_name TEXT NOT NULL,
  repo_path TEXT NOT NULL,
  file TEXT NOT NULL,
  mode TEXT NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  released_at INTEGER,
  release_summary TEXT,
  waiters_json TEXT NOT NULL DEFAULT '[]'
);
CREATE INDEX IF NOT EXISTS claims_repo_status ON claims(repo_path, status);
CREATE INDEX IF NOT EXISTS claims_file ON claims(repo_path, file, status);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  repo_path TEXT NOT NULL,
  from_id TEXT NOT NULL,
  from_name TEXT NOT NULL,
  to_id TEXT,
  body TEXT NOT NULL,
  ts INTEGER NOT NULL,
  warnings_json TEXT
);
CREATE INDEX IF NOT EXISTS messages_repo_ts ON messages(repo_path, ts);
CREATE INDEX IF NOT EXISTS messages_to_ts ON messages(to_id, ts);

CREATE TABLE IF NOT EXISTS activity (
  id TEXT PRIMARY KEY,
  repo_path TEXT NOT NULL,
  kind TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  agent_name TEXT NOT NULL,
  target TEXT,
  body TEXT,
  peer TEXT,
  ts INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS activity_repo_ts ON activity(repo_path, ts);

CREATE TABLE IF NOT EXISTS repos (
  repo_path TEXT PRIMARY KEY,
  basename TEXT NOT NULL,
  first_seen INTEGER NOT NULL,
  last_seen INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS questions (
  id TEXT PRIMARY KEY,
  asker_id TEXT NOT NULL,
  repo_path TEXT NOT NULL,
  question TEXT NOT NULL,
  observer_id TEXT,
  status TEXT NOT NULL,
  sent_at INTEGER NOT NULL,
  follow_up_at INTEGER,
  escalated_at INTEGER,
  escalated_to TEXT,
  answered_at INTEGER,
  answer_message_id TEXT
);
CREATE INDEX IF NOT EXISTS questions_status_sent ON questions(status, sent_at);
`;

export function defaultDbPath(): string {
  const dir = path.join(os.homedir(), '.aol');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, 'aol.db');
}

export type Db = Database.Database;

export function openDb(filename?: string): Db {
  const file = filename ?? defaultDbPath();
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.exec(SCHEMA);
  return db;
}
