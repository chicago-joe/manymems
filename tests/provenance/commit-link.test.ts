import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { mkdtempSync, rmSync, mkdirSync, existsSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { SessionStore } from '../../src/services/sqlite/SessionStore.js';
import {
  editChangeToProvenanceRecord,
  storeProvenanceRecords,
  linkCommitToProvenance,
  queryProvenanceByLine,
} from '../../src/services/provenance/store.js';
import { buildPostCommitHook, installPostCommitHook } from '../../src/services/provenance/commit-hook.js';
import type { EditChange } from '../../src/services/provenance/extract-line-range.js';

function change(file: string): EditChange {
  return {
    file_path: file,
    line_start: 1,
    line_end: 3,
    old_content_hash: 'o',
    new_content_hash: 'n',
    tool_name: 'Edit',
    symbol_anchor: null,
  };
}

describe('A4 commit backfill', () => {
  let db: Database;
  let store: SessionStore;

  beforeEach(() => {
    db = new Database(':memory:');
    db.run('PRAGMA foreign_keys = ON');
    store = new SessionStore(db);
  });
  afterEach(() => store.close());

  it('backfills commit_sha only on matching NULL rows', () => {
    const a = editChangeToProvenanceRecord(change('/repo/a.ts'), { project: 'p', occurred_at_epoch: 100 });
    const b = editChangeToProvenanceRecord(change('/repo/b.ts'), { project: 'p', occurred_at_epoch: 100 });
    storeProvenanceRecords(db, [a, b]);

    const updated = linkCommitToProvenance(db, ['/repo/a.ts'], 'sha-111');
    expect(updated).toBe(1);
    expect(queryProvenanceByLine(db, '/repo/a.ts', 1)[0].commit_sha).toBe('sha-111');
    expect(queryProvenanceByLine(db, '/repo/b.ts', 1)[0].commit_sha).toBeNull();
  });

  it('is idempotent — never overwrites an existing commit_sha', () => {
    const a = editChangeToProvenanceRecord(change('/repo/a.ts'), { project: 'p', occurred_at_epoch: 100 });
    storeProvenanceRecords(db, [a]);
    linkCommitToProvenance(db, ['/repo/a.ts'], 'sha-first');
    const again = linkCommitToProvenance(db, ['/repo/a.ts'], 'sha-second');
    expect(again).toBe(0);
    expect(queryProvenanceByLine(db, '/repo/a.ts', 1)[0].commit_sha).toBe('sha-first');
  });

  it('respects since_epoch — only attributes edits made after the prev commit', () => {
    const old = editChangeToProvenanceRecord(change('/repo/a.ts'), { project: 'p', occurred_at_epoch: 50 });
    const fresh = editChangeToProvenanceRecord(change('/repo/a.ts'), { project: 'p', occurred_at_epoch: 150 });
    storeProvenanceRecords(db, [old, fresh]);

    const updated = linkCommitToProvenance(db, ['/repo/a.ts'], 'sha-x', 100);
    expect(updated).toBe(1); // only the fresh row (epoch 150 > 100)
  });
});

describe('A4 post-commit hook installer', () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'cm-hook-')); mkdirSync(join(dir, '.git', 'hooks'), { recursive: true }); });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('writes an executable hook containing the link-commit call', () => {
    const res = installPostCommitHook(dir, 37777);
    expect(res.installed).toBe(true);
    expect(existsSync(res.path)).toBe(true);
    const body = readFileSync(res.path, 'utf-8');
    expect(body).toContain('/api/provenance/link-commit');
    expect(body).toContain('37777');
  });

  it('refuses to clobber a foreign existing hook', () => {
    writeFileSync(join(dir, '.git', 'hooks', 'post-commit'), '#!/bin/sh\necho mine\n');
    const res = installPostCommitHook(dir, 37777);
    expect(res.installed).toBe(false);
    expect(res.reason).toBe('foreign_hook_present');
  });

  it('refreshes its own previously-installed hook', () => {
    installPostCommitHook(dir, 11111);
    const res = installPostCommitHook(dir, 22222);
    expect(res.installed).toBe(true);
    expect(readFileSync(res.path, 'utf-8')).toContain('22222');
  });

  it('buildPostCommitHook embeds the given port', () => {
    expect(buildPostCommitHook(40404)).toContain('40404');
  });
});
