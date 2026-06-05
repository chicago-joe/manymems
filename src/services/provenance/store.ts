import { Database } from 'bun:sqlite';
import { randomUUID } from 'node:crypto';
import type { EditChange } from './extract-line-range.js';

// A single intent->code provenance record: links one edited line range
// (and the tree-sitter symbol that contains it) back to the user prompt and
// observation that produced it. Persisted in the `code_provenance` table
// (SQLite migration 36 / Postgres bootstrap).
export interface ProvenanceRecord {
  id: string;
  project: string;
  team_id?: string | null;
  actor_id?: string | null;
  agent_tool_id?: string | null;
  agent_id?: string | null;
  session_id?: string | null;
  user_prompt_id?: number | null;
  observation_id?: number | null;
  file_path: string;
  line_start: number;
  line_end: number;
  symbol_qualified_name?: string | null;
  symbol_kind?: string | null;
  signature_hash?: string | null;
  line_offset_from_symbol_start?: number | null;
  old_content_hash?: string | null;
  new_content_hash?: string | null;
  commit_sha?: string | null;
  stale: boolean;
  occurred_at_epoch: number;
}

export interface ProvenanceContext {
  project: string;
  session_id?: string | null;
  user_prompt_id?: number | null;
  observation_id?: number | null;
  team_id?: string | null;
  actor_id?: string | null;
  agent_tool_id?: string | null;
  agent_id?: string | null;
  occurred_at_epoch?: number;
}

// Converts an EditChange (file/line range + symbol anchor from A1/A2) into a
// fully-formed ProvenanceRecord, stamping the intent context (prompt, session,
// identity) onto it.
export function editChangeToProvenanceRecord(
  change: EditChange,
  context: ProvenanceContext,
): ProvenanceRecord {
  return {
    id: randomUUID(),
    project: context.project,
    team_id: context.team_id ?? null,
    actor_id: context.actor_id ?? null,
    agent_tool_id: context.agent_tool_id ?? null,
    agent_id: context.agent_id ?? null,
    session_id: context.session_id ?? null,
    user_prompt_id: context.user_prompt_id ?? null,
    observation_id: context.observation_id ?? null,
    file_path: change.file_path,
    line_start: change.line_start,
    line_end: change.line_end,
    symbol_qualified_name: change.symbol_anchor?.qualified_name ?? null,
    symbol_kind: change.symbol_anchor?.kind ?? null,
    signature_hash: change.symbol_anchor?.signature_hash ?? null,
    line_offset_from_symbol_start: change.symbol_anchor?.line_offset_from_symbol_start ?? null,
    old_content_hash: change.old_content_hash ?? null,
    new_content_hash: change.new_content_hash ?? null,
    commit_sha: null,
    stale: false,
    occurred_at_epoch: context.occurred_at_epoch ?? Date.now(),
  };
}

// Resolves the user_prompts.id for the prompt that triggered these edits.
// Prefers an exact (content_session_id, prompt_number) match; otherwise falls
// back to the most recent prompt for the session. Returns null if none exist.
export function resolveUserPromptId(
  db: Database,
  contentSessionId: string,
  promptNumber?: number | null,
): number | null {
  if (promptNumber != null) {
    const row = db
      .prepare('SELECT id FROM user_prompts WHERE content_session_id = ? AND prompt_number = ? LIMIT 1')
      .get(contentSessionId, promptNumber) as { id: number } | undefined;
    if (row) return row.id;
  }
  const latest = db
    .prepare('SELECT id FROM user_prompts WHERE content_session_id = ? ORDER BY prompt_number DESC LIMIT 1')
    .get(contentSessionId) as { id: number } | undefined;
  return latest?.id ?? null;
}

// Persists provenance records. Idempotent on `id`. Returns the count inserted.
export function storeProvenanceRecords(db: Database, records: ProvenanceRecord[]): number {
  if (records.length === 0) return 0;
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO code_provenance (
      id, project, team_id, actor_id, agent_tool_id, agent_id, session_id,
      user_prompt_id, observation_id, file_path, line_start, line_end,
      symbol_qualified_name, symbol_kind, signature_hash, line_offset_from_symbol_start,
      old_content_hash, new_content_hash, commit_sha, stale, occurred_at_epoch
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  let inserted = 0;
  const insertAll = db.transaction((rows: ProvenanceRecord[]) => {
    for (const r of rows) {
      stmt.run(
        r.id, r.project, r.team_id ?? null, r.actor_id ?? null, r.agent_tool_id ?? null,
        r.agent_id ?? null, r.session_id ?? null, r.user_prompt_id ?? null, r.observation_id ?? null,
        r.file_path, r.line_start, r.line_end, r.symbol_qualified_name ?? null,
        r.symbol_kind ?? null, r.signature_hash ?? null, r.line_offset_from_symbol_start ?? null,
        r.old_content_hash ?? null, r.new_content_hash ?? null, r.commit_sha ?? null,
        r.stale ? 1 : 0, r.occurred_at_epoch,
      );
      inserted++;
    }
  });
  insertAll(records);
  return inserted;
}

// Finds provenance records whose line range covers `line` in `file_path`.
// Backs the get_code_provenance query surface (A5) and round-trip tests.
export function queryProvenanceByLine(
  db: Database,
  file_path: string,
  line: number,
): ProvenanceRecord[] {
  const rows = db
    .prepare(`
      SELECT * FROM code_provenance
      WHERE file_path = ? AND line_start <= ? AND line_end >= ?
      ORDER BY occurred_at_epoch DESC
    `)
    .all(file_path, line, line) as Array<Record<string, unknown>>;
  return rows.map(rowToProvenanceRecord);
}

// A4: backfill commit_sha onto provenance rows whose file was changed by a
// commit. Only fills rows where commit_sha IS NULL (idempotent) and, when
// `sinceEpoch` is given, only those recorded after the previous commit — so an
// edit is attributed to the commit that actually shipped it, not a later one.
// Returns the number of rows updated.
export function linkCommitToProvenance(
  db: Database,
  changedFiles: string[],
  commitSha: string,
  sinceEpoch?: number,
): number {
  if (changedFiles.length === 0) return 0;
  const placeholders = changedFiles.map(() => '?').join(', ');
  const sinceClause = sinceEpoch != null ? 'AND occurred_at_epoch > ?' : '';
  const sql = `
    UPDATE code_provenance
    SET commit_sha = ?
    WHERE commit_sha IS NULL
      AND file_path IN (${placeholders})
      ${sinceClause}
  `;
  const params: unknown[] = [commitSha, ...changedFiles];
  if (sinceEpoch != null) params.push(sinceEpoch);
  const result = db.prepare(sql).run(...(params as never[]));
  return Number(result.changes ?? 0);
}

// Off-hot-path symbol backfill: update a stored row with its resolved
// tree-sitter symbol anchor (qualified name + signature hash baseline for
// staleness). Called asynchronously by the worker after capture, never on the
// edit hook path. Returns true if a row was updated.
export function updateProvenanceSymbol(
  db: Database,
  id: string,
  anchor: {
    qualified_name: string;
    kind: string;
    signature_hash: string;
    line_offset_from_symbol_start: number;
  },
): boolean {
  const result = db
    .prepare(`
      UPDATE code_provenance
      SET symbol_qualified_name = ?, symbol_kind = ?, signature_hash = ?, line_offset_from_symbol_start = ?
      WHERE id = ?
    `)
    .run(anchor.qualified_name, anchor.kind, anchor.signature_hash, anchor.line_offset_from_symbol_start, id);
  return Number(result.changes ?? 0) > 0;
}

// A5: primary resolution — provenance for a known tree-sitter symbol in a file.
// Survives line drift because it keys on the qualified symbol name, not lines.
export function queryProvenanceBySymbol(
  db: Database,
  file_path: string,
  qualified_name: string,
): ProvenanceRecord[] {
  const rows = db
    .prepare(`
      SELECT * FROM code_provenance
      WHERE file_path = ? AND symbol_qualified_name = ?
      ORDER BY occurred_at_epoch DESC
    `)
    .all(file_path, qualified_name) as Array<Record<string, unknown>>;
  return rows.map(rowToProvenanceRecord);
}

function rowToProvenanceRecord(row: Record<string, unknown>): ProvenanceRecord {
  return {
    id: row.id as string,
    project: row.project as string,
    team_id: (row.team_id as string) ?? null,
    actor_id: (row.actor_id as string) ?? null,
    agent_tool_id: (row.agent_tool_id as string) ?? null,
    agent_id: (row.agent_id as string) ?? null,
    session_id: (row.session_id as string) ?? null,
    user_prompt_id: (row.user_prompt_id as number) ?? null,
    observation_id: (row.observation_id as number) ?? null,
    file_path: row.file_path as string,
    line_start: row.line_start as number,
    line_end: row.line_end as number,
    symbol_qualified_name: (row.symbol_qualified_name as string) ?? null,
    symbol_kind: (row.symbol_kind as string) ?? null,
    signature_hash: (row.signature_hash as string) ?? null,
    line_offset_from_symbol_start: (row.line_offset_from_symbol_start as number) ?? null,
    old_content_hash: (row.old_content_hash as string) ?? null,
    new_content_hash: (row.new_content_hash as string) ?? null,
    commit_sha: (row.commit_sha as string) ?? null,
    stale: (row.stale as number) === 1,
    occurred_at_epoch: row.occurred_at_epoch as number,
  };
}
