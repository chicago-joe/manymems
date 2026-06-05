import { describe, it, expect } from 'bun:test';
import { SessionStore } from '../../src/services/sqlite/SessionStore';

describe('B3 staleness + dedup columns (migration 38)', () => {
  it('migration 38 adds all 5 new columns', () => {
    const store = new SessionStore(':memory:');
    const cols = store.db.prepare('PRAGMA table_info(observations)').all() as Array<{ name: string }>;
    const colNames = cols.map(c => c.name);
    expect(colNames).toContain('stale');
    expect(colNames).toContain('stale_reason');
    expect(colNames).toContain('last_valid_commit');
    expect(colNames).toContain('contradicts_observation_id');
    expect(colNames).toContain('possible_duplicate');
    store.close();
  });

  it('version 38 is recorded in schema_versions', () => {
    const store = new SessionStore(':memory:');
    const v = store.db.prepare('SELECT version FROM schema_versions WHERE version = 38').get() as { version: number } | undefined;
    expect(v?.version).toBe(38);
    store.close();
  });

  it('stale defaults to 0, possible_duplicate defaults to 0', () => {
    const store = new SessionStore(':memory:');
    const sessionDbId = store.createSDKSession('test-b3', '/test', 'prompt');
    store.updateMemorySessionId(sessionDbId, 'mem-b3-1');
    store.db.prepare(`
      INSERT INTO observations (memory_session_id, project, text, type, title, content_hash, visibility, created_at, created_at_epoch)
      VALUES ('mem-b3-1', '/test', 'b3 obs', 'feature', 'B3 Test', 'hash-b3-001', 'private', datetime('now'), ?)
    `).run(Date.now());
    const obs = store.db.prepare("SELECT stale, possible_duplicate FROM observations WHERE content_hash = 'hash-b3-001'")
      .get() as { stale: number; possible_duplicate: number };
    expect(obs.stale).toBe(0);
    expect(obs.possible_duplicate).toBe(0);
    store.close();
  });

  it('can mark observation stale with reason', () => {
    const store = new SessionStore(':memory:');
    const sessionDbId = store.createSDKSession('test-b3-stale', '/test', 'prompt');
    store.updateMemorySessionId(sessionDbId, 'mem-b3-stale');
    store.db.prepare(`
      INSERT INTO observations (memory_session_id, project, text, type, title, content_hash, visibility, created_at, created_at_epoch)
      VALUES ('mem-b3-stale', '/test', 'stale obs', 'feature', 'Stale', 'hash-b3-002', 'private', datetime('now'), ?)
    `).run(Date.now());
    const obs = store.db.prepare("SELECT id FROM observations WHERE content_hash = 'hash-b3-002'").get() as { id: number };
    store.db.prepare('UPDATE observations SET stale = 1, stale_reason = ?, last_valid_commit = ? WHERE id = ?')
      .run('symbol deleted', 'abc123', obs.id);
    const updated = store.db.prepare('SELECT stale, stale_reason, last_valid_commit FROM observations WHERE id = ?').get(obs.id) as { stale: number; stale_reason: string; last_valid_commit: string };
    expect(updated.stale).toBe(1);
    expect(updated.stale_reason).toBe('symbol deleted');
    expect(updated.last_valid_commit).toBe('abc123');
    store.close();
  });
});
