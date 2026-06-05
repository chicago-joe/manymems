import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { SessionStore } from '../../src/services/sqlite/SessionStore.js';
import { buildSymbolAnchor } from '../../src/services/provenance/symbol-anchor.js';
import { editChangeToProvenanceRecord, storeProvenanceRecords, queryProvenanceByLine } from '../../src/services/provenance/store.js';
import { getCodeProvenance, resolveProvenanceSymbols } from '../../src/services/provenance/query.js';
import type { EditChange } from '../../src/services/provenance/extract-line-range.js';

// A5 (Level 2/3): real fixture file so tree-sitter resolves a symbol, then the
// "why was this written" query + staleness via signature re-hash.
const SAMPLE = `export function alpha(x: number): number {
  const y = x + 1;
  return y;
}

export function beta(name: string): string {
  return "hi " + name;
}
`;

describe('A5 get_code_provenance', () => {
  let dir: string;
  let file: string;
  let db: Database;
  let store: SessionStore;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'cm-q-'));
    file = join(dir, 'sample.ts');
    writeFileSync(file, SAMPLE, 'utf-8');
    db = new Database(':memory:');
    db.run('PRAGMA foreign_keys = ON');
    store = new SessionStore(db);
  });
  afterEach(() => { store.close(); rmSync(dir, { recursive: true, force: true }); });

  async function recordEditInAlpha(promptText: string, signatureOverride?: string) {
    const sessionId = 'sess-q';
    store.createSDKSession(sessionId, 'demo', promptText);
    store.saveUserPrompt(sessionId, 1, promptText);
    const promptId = store.resolveProvenancePromptId(sessionId, 1);

    // line 2 is inside alpha()
    const anchor = await buildSymbolAnchor(file, 2, 2);
    expect(anchor?.qualified_name).toBe('alpha');

    const change: EditChange = {
      file_path: file,
      line_start: 2,
      line_end: 2,
      old_content_hash: 'o',
      new_content_hash: 'n',
      tool_name: 'Edit',
      symbol_anchor: signatureOverride
        ? { ...anchor!, signature_hash: signatureOverride }
        : anchor,
    };
    const rec = editChangeToProvenanceRecord(change, {
      project: 'demo', session_id: sessionId, user_prompt_id: promptId,
    });
    storeProvenanceRecords(db, [rec]);
    return sessionId;
  }

  it('resolves by symbol and returns the originating prompt', async () => {
    await recordEditInAlpha('make alpha increment by one');
    const result = await getCodeProvenance(store, file, 2);
    expect(result.resolved_by).toBe('symbol');
    expect(result.symbol).toBe('alpha');
    expect(result.changes.length).toBe(1);
    expect(result.changes[0].prompt_text).toBe('make alpha increment by one');
    expect(result.changes[0].stale).toBe(false);
  }, 30000);

  it('flags stale when the symbol signature drifted since capture', async () => {
    // Stored with a signature hash that no longer matches the current symbol.
    await recordEditInAlpha('old intent', 'STALE-SIGNATURE-HASH');
    const result = await getCodeProvenance(store, file, 2);
    expect(result.resolved_by).toBe('symbol');
    expect(result.changes[0].stale).toBe(true);
  }, 30000);

  it('omits prompt text when include_prompt is false', async () => {
    await recordEditInAlpha('secret intent');
    const result = await getCodeProvenance(store, file, 2, false);
    expect(result.changes[0].prompt_text).toBeUndefined();
  }, 30000);

  it('returns no changes for a line with no recorded provenance', async () => {
    await recordEditInAlpha('make alpha increment by one');
    // line 7 is inside beta(), which has no provenance row
    const result = await getCodeProvenance(store, file, 7);
    expect(result.changes.length).toBe(0);
  }, 30000);

  it('off-hot-path resolver backfills the symbol anchor on a line-only row', async () => {
    // Mirrors the real capture flow: A1 stores line ranges + hashes with NO
    // symbol anchor; resolveProvenanceSymbols (worker, async) backfills it.
    const sessionId = 'sess-resolve';
    store.createSDKSession(sessionId, 'demo', 'edit alpha');
    store.saveUserPrompt(sessionId, 1, 'edit alpha');
    const promptId = store.resolveProvenancePromptId(sessionId, 1);

    const lineOnly = editChangeToProvenanceRecord(
      { file_path: file, line_start: 2, line_end: 2, old_content_hash: 'o', new_content_hash: 'n', tool_name: 'Edit', symbol_anchor: null },
      { project: 'demo', session_id: sessionId, user_prompt_id: promptId },
    );
    storeProvenanceRecords(db, [lineOnly]);

    // Before resolution: no symbol recorded.
    expect(queryProvenanceByLine(db, file, 2)[0].symbol_qualified_name).toBeNull();

    const resolved = await resolveProvenanceSymbols(store, [
      { id: lineOnly.id, file_path: file, line_start: 2, line_end: 2 },
    ]);
    expect(resolved).toBe(1);

    // After resolution: symbol + signature baseline persisted.
    const row = queryProvenanceByLine(db, file, 2)[0];
    expect(row.symbol_qualified_name).toBe('alpha');
    expect(typeof row.signature_hash).toBe('string');

    // And the query surface now reports it as fresh (not stale).
    const result = await getCodeProvenance(store, file, 2);
    expect(result.changes[0].stale).toBe(false);
  }, 30000);
});
