import type { Database } from 'bun:sqlite';
import { logger } from '../../utils/logger.js';
import type { StalenessCheckJob } from './types.js';

/**
 * B3: Mark observations stale when their linked code_provenance symbol has been
 * deleted or significantly changed. Runs async (never on the write path).
 *
 * Strategy:
 * 1. Find observations whose code_provenance rows point to pushedFiles
 * 2. For each: check if symbol_qualified_name still appears in the current file
 *    (simple text check — tree-sitter re-parse is too expensive in a batch job)
 * 3. If symbol gone → mark observation stale with reason
 * 4. Otherwise update last_valid_commit
 *
 * Does NOT auto-resolve or delete — only marks and surfaces for review.
 */
export async function processStalenessCheck(
  payload: StalenessCheckJob,
  db: Database,
): Promise<void> {
  const { pushedFiles, commitSha } = payload;
  if (!pushedFiles.length) return;

  const placeholders = pushedFiles.map(() => '?').join(', ');
  const rows = db.prepare(`
    SELECT DISTINCT o.id AS obs_id, cp.symbol_qualified_name, cp.file_path
    FROM observations o
    JOIN code_provenance cp ON cp.observation_id = o.id
    WHERE cp.file_path IN (${placeholders})
      AND cp.symbol_qualified_name IS NOT NULL
      AND o.stale = 0
  `).all(...pushedFiles) as Array<{ obs_id: number; symbol_qualified_name: string; file_path: string }>;

  const { existsSync, readFileSync } = await import('fs');

  for (const row of rows) {
    if (!existsSync(row.file_path)) {
      db.prepare('UPDATE observations SET stale = 1, stale_reason = ?, last_valid_commit = ? WHERE id = ?')
        .run('file deleted', commitSha, row.obs_id);
      logger.info('WORKER', 'B3: marked stale (file deleted)', { obs_id: row.obs_id, file: row.file_path });
      continue;
    }
    const content = readFileSync(row.file_path, 'utf-8');
    const symbolBase = row.symbol_qualified_name.split('.').pop() ?? row.symbol_qualified_name;
    if (!content.includes(symbolBase)) {
      db.prepare('UPDATE observations SET stale = 1, stale_reason = ?, last_valid_commit = ? WHERE id = ?')
        .run('symbol deleted', commitSha, row.obs_id);
      logger.info('WORKER', 'B3: marked stale (symbol deleted)', { obs_id: row.obs_id, symbol: row.symbol_qualified_name });
    } else {
      db.prepare('UPDATE observations SET last_valid_commit = ? WHERE id = ? AND last_valid_commit IS NULL')
        .run(commitSha, row.obs_id);
    }
  }
}
