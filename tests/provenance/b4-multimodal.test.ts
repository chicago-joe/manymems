import { describe, it, expect } from 'bun:test';
import { SessionStore } from '../../src/services/sqlite/SessionStore';

describe('B4 multimodal columns (migration 39)', () => {
  it('migration 39 adds modality, content_pointer, content_summary', () => {
    const store = new SessionStore(':memory:');
    const cols = store.db.prepare('PRAGMA table_info(observations)').all() as Array<{ name: string }>;
    const colNames = cols.map(c => c.name);
    expect(colNames).toContain('modality');
    expect(colNames).toContain('content_pointer');
    expect(colNames).toContain('content_summary');
    store.close();
  });

  it('version 39 in schema_versions', () => {
    const store = new SessionStore(':memory:');
    const v = store.db.prepare('SELECT version FROM schema_versions WHERE version = 39').get() as { version: number } | undefined;
    expect(v?.version).toBe(39);
    store.close();
  });

  it('modality defaults to text', () => {
    const store = new SessionStore(':memory:');
    const sessionDbId = store.createSDKSession('test-b4', '/test', 'prompt');
    store.updateMemorySessionId(sessionDbId, 'mem-b4-1');
    store.db.prepare(`
      INSERT INTO observations (memory_session_id, project, text, type, title, content_hash, visibility, created_at, created_at_epoch)
      VALUES ('mem-b4-1', '/test', 'b4 obs', 'feature', 'B4', 'hash-b4-001', 'private', datetime('now'), ?)
    `).run(Date.now());
    const obs = store.db.prepare("SELECT modality FROM observations WHERE content_hash = 'hash-b4-001'").get() as { modality: string };
    expect(obs.modality).toBe('text');
    store.close();
  });

  it('can store screenshot modality with pointer and summary', () => {
    const store = new SessionStore(':memory:');
    const sessionDbId = store.createSDKSession('test-b4-screenshot', '/test', 'prompt');
    store.updateMemorySessionId(sessionDbId, 'mem-b4-2');
    store.db.prepare(`
      INSERT INTO observations (memory_session_id, project, text, type, title, content_hash, visibility,
        modality, content_pointer, content_summary, created_at, created_at_epoch)
      VALUES ('mem-b4-2', '/test', 'dashboard screenshot', 'multimodal', 'Screenshot', 'hash-b4-002', 'private',
        'screenshot', '/tmp/shot.png', 'Dashboard showing error rate spike at 14:32', datetime('now'), ?)
    `).run(Date.now());
    const obs = store.db.prepare(`
      SELECT modality, content_pointer, content_summary FROM observations WHERE content_hash = 'hash-b4-002'
    `).get() as { modality: string; content_pointer: string; content_summary: string };
    expect(obs.modality).toBe('screenshot');
    expect(obs.content_pointer).toBe('/tmp/shot.png');
    expect(obs.content_summary).toContain('error rate spike');
    store.close();
  });
});
