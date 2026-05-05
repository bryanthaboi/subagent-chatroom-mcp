import { describe, it, expect } from 'vitest';
import { openDb } from '../src/daemon/db.js';

describe('db', () => {
  it('creates schema on a fresh in-memory db', () => {
    const db = openDb(':memory:');
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as { name: string }[];
    const names = tables.map((t) => t.name);
    expect(names).toContain('agents');
    expect(names).toContain('claims');
    expect(names).toContain('messages');
    expect(names).toContain('activity');
    expect(names).toContain('repos');
    expect(names).toContain('questions');
    db.close();
  });

  it('round-trips an agent insert + select', () => {
    const db = openDb(':memory:');
    db.prepare(
      `INSERT INTO agents
        (id, name, repo_path, status, role, color, created_at, last_seen)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run('a', 'alice', '/tmp/r', 'online', 'agent', '#fff', 1, 1);
    const row = db.prepare('SELECT * FROM agents WHERE id = ?').get('a') as { name: string; repo_path: string };
    expect(row.name).toBe('alice');
    expect(row.repo_path).toBe('/tmp/r');
    db.close();
  });
});
