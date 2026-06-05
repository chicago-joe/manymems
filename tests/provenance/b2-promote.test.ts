import { describe, it, expect } from 'bun:test';
import { SessionStore } from '../../src/services/sqlite/SessionStore';

describe('B2 promotion columns (migration 37)', () => {
  it('migration 37 adds promoted_at and promoted_by to observations', () => {
    const store = new SessionStore(':memory:');
    const cols = store.db.prepare('PRAGMA table_info(observations)').all() as Array<{ name: string }>;
    const colNames = cols.map(c => c.name);
    expect(colNames).toContain('promoted_at');
    expect(colNames).toContain('promoted_by');
    store.close();
  });

  it('version 37 is recorded in schema_versions', () => {
    const store = new SessionStore(':memory:');
    const v = store.db.prepare('SELECT version FROM schema_versions WHERE version = 37').get() as { version: number } | undefined;
    expect(v?.version).toBe(37);
    store.close();
  });

  it('promote SQL sets visibility, promoted_at, promoted_by', () => {
    const store = new SessionStore(':memory:');
    // Create minimal session first
    const sessionDbId = store.createSDKSession('test-sess', '/test', 'test prompt');
    store.updateMemorySessionId(sessionDbId, 'mem-sess-1');
    // Insert a minimal observation with visibility=private
    store.db.prepare(`
      INSERT INTO observations (memory_session_id, project, text, type, title, content_hash, visibility, created_at, created_at_epoch)
      VALUES ('mem-sess-1', '/test', 'test obs', 'feature', 'Test', 'hash-001', 'private', datetime('now'), ?)
    `).run(Date.now());
    const obs = store.db.prepare("SELECT id FROM observations WHERE content_hash = 'hash-001'").get() as { id: number };

    const now = Date.now();
    store.db.prepare('UPDATE observations SET visibility = ?, promoted_at = ?, promoted_by = ? WHERE id = ?')
      .run('team', now, 'alice', obs.id);

    const updated = store.db.prepare('SELECT visibility, promoted_at, promoted_by FROM observations WHERE id = ?').get(obs.id) as { visibility: string; promoted_at: number; promoted_by: string };
    expect(updated.visibility).toBe('team');
    expect(updated.promoted_at).toBe(now);
    expect(updated.promoted_by).toBe('alice');
    store.close();
  });
});
