import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { SessionStore } from '../../src/services/sqlite/SessionStore.js';
import {
  editChangeToProvenanceRecord,
  storeProvenanceRecords,
  queryProvenanceByLine,
  resolveUserPromptId,
} from '../../src/services/provenance/store.js';
import type { EditChange } from '../../src/services/provenance/extract-line-range.js';

// Level 2 (SQLite round-trip): exercises the real migration chain via
// SessionStore(:memory:), then the provenance store + query layer end to end.
// This suite is the regression guard for the migration-36 gap: SessionStore's
// inline chain must create code_provenance, not only MigrationRunner.

function makeEditChange(overrides: Partial<EditChange> = {}): EditChange {
  return {
    file_path: '/repo/src/auth.ts',
    line_start: 10,
    line_end: 14,
    old_content_hash: 'old-hash',
    new_content_hash: 'new-hash',
    tool_name: 'Edit',
    symbol_anchor: {
      qualified_name: 'AuthService.login',
      kind: 'method',
      signature_hash: 'sig-hash-abc',
      line_offset_from_symbol_start: 2,
    },
    ...overrides,
  };
}

describe('code_provenance store', () => {
  let db: Database;
  let store: SessionStore;

  beforeEach(() => {
    db = new Database(':memory:');
    db.run('PRAGMA foreign_keys = ON');
    // Passing the handle still runs the full inline migration chain.
    store = new SessionStore(db);
  });

  afterEach(() => {
    store.close();
  });

  it('migration 36 creates the code_provenance table in the inline chain', () => {
    const row = db
      .query("SELECT name FROM sqlite_master WHERE type='table' AND name='code_provenance'")
      .get() as { name: string } | undefined;
    expect(row?.name).toBe('code_provenance');

    const applied = db
      .prepare('SELECT version FROM schema_versions WHERE version = ?')
      .get(36) as { version: number } | undefined;
    expect(applied?.version).toBe(36);
  });

  it('editChangeToProvenanceRecord maps every field including the symbol anchor', () => {
    const rec = editChangeToProvenanceRecord(makeEditChange(), {
      project: 'demo',
      session_id: 'sess-1',
      user_prompt_id: 42,
      observation_id: 7,
      actor_id: 'alice',
      agent_tool_id: 'claude-code',
      occurred_at_epoch: 1000,
    });
    expect(rec.id).toBeTruthy();
    expect(rec.project).toBe('demo');
    expect(rec.user_prompt_id).toBe(42);
    expect(rec.observation_id).toBe(7);
    expect(rec.symbol_qualified_name).toBe('AuthService.login');
    expect(rec.symbol_kind).toBe('method');
    expect(rec.signature_hash).toBe('sig-hash-abc');
    expect(rec.line_offset_from_symbol_start).toBe(2);
    expect(rec.stale).toBe(false);
    expect(rec.occurred_at_epoch).toBe(1000);
  });

  it('null symbol anchor produces null anchor columns (edit outside any symbol)', () => {
    const rec = editChangeToProvenanceRecord(
      makeEditChange({ symbol_anchor: null }),
      { project: 'demo' },
    );
    expect(rec.symbol_qualified_name).toBeNull();
    expect(rec.signature_hash).toBeNull();
    expect(rec.line_offset_from_symbol_start).toBeNull();
  });

  it('stores records and queries them back by covered line', () => {
    const rec = editChangeToProvenanceRecord(makeEditChange(), { project: 'demo' });
    const inserted = storeProvenanceRecords(db, [rec]);
    expect(inserted).toBe(1);

    // line 12 falls inside [10,14]
    const hits = queryProvenanceByLine(db, '/repo/src/auth.ts', 12);
    expect(hits.length).toBe(1);
    expect(hits[0].symbol_qualified_name).toBe('AuthService.login');

    // line 99 is outside the range
    expect(queryProvenanceByLine(db, '/repo/src/auth.ts', 99).length).toBe(0);
  });

  it('is idempotent on id (INSERT OR IGNORE)', () => {
    const rec = editChangeToProvenanceRecord(makeEditChange(), { project: 'demo' });
    storeProvenanceRecords(db, [rec]);
    storeProvenanceRecords(db, [rec]);
    expect(queryProvenanceByLine(db, '/repo/src/auth.ts', 12).length).toBe(1);
  });

  it('links a real user_prompt: prompt -> provenance FK round-trips', () => {
    const sessionId = 'content-sess-A';
    store.createSDKSession(sessionId, 'demo', 'fix the login bug');
    store.saveUserPrompt(sessionId, 1, 'fix the login bug');

    const promptId = resolveUserPromptId(db, sessionId, 1);
    expect(promptId).not.toBeNull();

    const rec = editChangeToProvenanceRecord(makeEditChange(), {
      project: 'demo',
      session_id: sessionId,
      user_prompt_id: promptId,
    });
    storeProvenanceRecords(db, [rec]);

    const hit = queryProvenanceByLine(db, '/repo/src/auth.ts', 11)[0];
    expect(hit.user_prompt_id).toBe(promptId!);

    // Join back to the prompt text — the "why was this written" path.
    const prompt = db
      .prepare('SELECT prompt_text FROM user_prompts WHERE id = ?')
      .get(hit.user_prompt_id!) as { prompt_text: string };
    expect(prompt.prompt_text).toBe('fix the login bug');
  });

  it('resolveUserPromptId falls back to the latest prompt when number is unknown', () => {
    const sessionId = 'content-sess-B';
    store.createSDKSession(sessionId, 'demo', 'first');
    store.saveUserPrompt(sessionId, 1, 'first');
    store.saveUserPrompt(sessionId, 2, 'second');

    const id = resolveUserPromptId(db, sessionId, null);
    const latest = db
      .prepare('SELECT id FROM user_prompts WHERE content_session_id = ? AND prompt_number = 2')
      .get(sessionId) as { id: number };
    expect(id).toBe(latest.id);
  });
});
