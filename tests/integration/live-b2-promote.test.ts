import { describe, it, expect, beforeAll } from 'bun:test';
import Database from 'bun:sqlite';
import { join } from 'node:path';

const WORKER_PORT = 37778;
const WORKER_BASE = `http://127.0.0.1:${WORKER_PORT}`;
const WORKER_DATA_DIR = '/tmp/manymems-e2e-home';
const workerDb = join(WORKER_DATA_DIR, 'claude-mem.db');

beforeAll(async () => {
  const r = await fetch(`${WORKER_BASE}/api/health`);
  const j = await r.json() as Record<string, unknown>;
  if (!j.initialized) throw new Error('worker not initialized');
  if (!(j.workerPath as string).includes('manymems')) throw new Error(`wrong worker: ${j.workerPath}`);
}, 5000);

describe('B2 promote endpoint (L3)', () => {
  it('POST /api/observations/nonexistent/promote returns 404', async () => {
    const r = await fetch(`${WORKER_BASE}/api/observations/does-not-exist/promote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ visibility: 'team' }),
    });
    expect(r.status).toBe(404);
  });

  it('migration 37 columns exist in live DB', () => {
    const db = new Database(workerDb, { readonly: true });
    try {
      const cols = db.prepare('PRAGMA table_info(observations)').all() as Array<{ name: string }>;
      const names = cols.map(c => c.name);
      expect(names).toContain('promoted_at');
      expect(names).toContain('promoted_by');
    } finally {
      db.close();
    }
  });
});
