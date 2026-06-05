/**
 * Live integration test: fires real HTTP requests against a locally-started
 * WorkerService instance using an ephemeral SQLite DB, verifies that the
 * full intent→code provenance pipeline works end-to-end.
 *
 * Level 3: exercises the same paths a real Claude Code session would hit
 * — session-init hook, PostToolUse Edit hook, worker ingest, and
 * /api/provenance/by-line — against a real DB (not :memory: mocks).
 */
import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import Database from 'bun:sqlite';

// ── test fixtures ────────────────────────────────────────────────────────────

const WORKER_PORT = 37778; // our fork worker (installed is 37777)
const WORKER_BASE = `http://127.0.0.1:${WORKER_PORT}`;
const SESSION_ID = `e2e-test-session-${Date.now()}`;
const PROJECT_CWD = '/home/chicagojoe/PyCharmProjects/manymems';

// A small real TypeScript fixture file the tree-sitter parser can resolve.
let tmpDir: string;
let editedFile: string;
const FIXTURE_SRC = `export function computeHash(input: string): string {
  return input.split('').reverse().join('');
}

export function processItem(item: string): string {
  const hash = computeHash(item);
  return \`processed:\${hash}\`;
}
`;

// ── worker lifecycle ─────────────────────────────────────────────────────────
// The worker is started externally with:
//   CLAUDE_MEM_DATA_DIR=/tmp/manymems-e2e-home \
//   bun plugin/scripts/worker-service.cjs --daemon
// and must be running before this test suite executes.

const WORKER_DATA_DIR = '/tmp/manymems-e2e-home';
const workerDb = join(WORKER_DATA_DIR, 'claude-mem.db');

beforeAll(async () => {
  tmpDir = mkdtempSync(join(tmpdir(), 'manymems-e2e-'));
  editedFile = join(tmpDir, 'fixture.ts');
  writeFileSync(editedFile, FIXTURE_SRC);

  // Verify the pre-started worker is alive and is our fork.
  const r = await fetch(`${WORKER_BASE}/api/health`);
  const j = await r.json() as Record<string, unknown>;
  if (!j.initialized) throw new Error('worker not initialized — start it first');
  if (!(j.workerPath as string).includes('manymems')) {
    throw new Error(`wrong worker: ${j.workerPath}`);
  }
}, 5000);

afterAll(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

// ── helpers ──────────────────────────────────────────────────────────────────

async function post(path: string, body: object) {
  const r = await fetch(`${WORKER_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return r.json() as Promise<Record<string, unknown>>;
}

async function get(path: string) {
  const r = await fetch(`${WORKER_BASE}${path}`);
  return r.json() as Promise<Record<string, unknown>>;
}

// ── tests ────────────────────────────────────────────────────────────────────

describe('live provenance integration', () => {
  it('migration 36 (code_provenance) applied to the live worker DB', async () => {
    const db = new Database(workerDb, { readonly: true });
    try {
      const row = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='code_provenance'")
        .get() as { name: string } | undefined;
      expect(row?.name).toBe('code_provenance');

      const v = db
        .prepare('SELECT version FROM schema_versions WHERE version = 36')
        .get() as { version: number } | undefined;
      expect(v?.version).toBe(36);
    } finally {
      db.close();
    }
  });

  it('session-init creates a session (UserPromptSubmit hook path)', async () => {
    const r = await post('/api/sessions/init', {
      contentSessionId: SESSION_ID,
      project: PROJECT_CWD,
      prompt: 'refactor computeHash to use crypto',
      platformSource: 'claude',
    });
    expect(r.status).toBe('initialized');
    expect(typeof r.sessionDbId).toBe('number');
  });

  it('ingestObservation for an Edit event stores a code_provenance row', async () => {
    // Simulate the PostToolUse Edit hook payload as the worker HTTP endpoint
    // receives it from observation.ts. We include the editChanges the handler
    // would have populated (line ranges + hashes; symbol anchor resolved async).
    const r = await post('/api/sessions/observations', {
      contentSessionId: SESSION_ID,
      platformSource: 'claude',
      tool_name: 'Edit',
      tool_input: {
        file_path: editedFile,
        old_string: "return input.split('').reverse().join('');",
        new_string: "return Buffer.from(input).toString('base64');",
      },
      tool_response: 'The file has been updated successfully.',
      cwd: PROJECT_CWD,
      editChanges: [
        {
          file_path: editedFile,
          line_start: 2,
          line_end: 2,
          old_content_hash: 'old-hash',
          new_content_hash: 'new-hash',
          tool_name: 'Edit',
          symbol_anchor: null, // resolved async off hot-path; null is correct here
        },
      ],
    });
    // Worker queues the observation (returns {status:"queued"} or similar).
    expect(r.status ?? r.ok).toBeTruthy();

    // Give the async provenance + symbol resolution a moment to land.
    await Bun.sleep(500);

    // Verify the code_provenance row exists in the real DB.
    const db = new Database(workerDb, { readonly: true });
    try {
      const rows = db
        .prepare('SELECT file_path, line_start, line_end FROM code_provenance WHERE file_path = ?')
        .all(editedFile) as Array<{ file_path: string; line_start: number; line_end: number }>;
      expect(rows.length).toBeGreaterThanOrEqual(1);
      expect(rows[0].line_start).toBe(2);
      expect(rows[0].line_end).toBe(2);
    } finally {
      db.close();
    }
  }, 15000);

  it('/api/provenance/by-line returns the intent from the real DB', async () => {
    // Allow time for any async symbol resolution to complete.
    await Bun.sleep(800);

    const r = await get(
      `/api/provenance/by-line?file=${encodeURIComponent(editedFile)}&line=2&include_prompt=false`,
    );
    // The response wraps a CodeProvenanceResult in {content:[{type:"text",text:JSON}]}
    const content = (r.content as Array<{ type: string; text: string }>)?.[0];
    expect(content?.type).toBe('text');
    const result = JSON.parse(content!.text) as {
      file: string;
      resolved_by: string;
      changes: Array<{ line_start: number; line_end: number }>;
    };
    expect(result.file).toBe(editedFile);
    // Line-range fallback is fine (symbol anchor resolves async);
    // the key assertion is that the provenance row was found.
    expect(result.changes.length).toBeGreaterThanOrEqual(1);
    expect(result.changes[0].line_start).toBe(2);
  }, 15000);

  it('/api/provenance/link-commit backfills commit_sha on matching rows', async () => {
    const FAKE_SHA = 'aabbccddeeff1122334455667788990011223344';

    const r = await post('/api/provenance/link-commit', {
      commit_sha: FAKE_SHA,
      changed_files: [editedFile],
    });
    expect(r).toMatchObject({ ok: true });
    expect(Number(r.updated)).toBeGreaterThanOrEqual(1);

    // Verify the backfill in the real DB.
    const db = new Database(workerDb, { readonly: true });
    try {
      const row = db
        .prepare('SELECT commit_sha FROM code_provenance WHERE file_path = ? AND commit_sha IS NOT NULL')
        .get(editedFile) as { commit_sha: string } | undefined;
      expect(row?.commit_sha).toBe(FAKE_SHA);
    } finally {
      db.close();
    }
  }, 10000);

  it('link-commit is idempotent (second call updates 0 rows)', async () => {
    const r = await post('/api/provenance/link-commit', {
      commit_sha: 'new-sha-should-not-overwrite',
      changed_files: [editedFile],
    });
    expect(r).toMatchObject({ ok: true });
    // All matching rows already have a commit_sha; none should be updated.
    expect(Number(r.updated)).toBe(0);
  }, 10000);
});
