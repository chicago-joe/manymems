import type { Database } from 'bun:sqlite';
import { logger } from '../../utils/logger.js';
import type { PromotionSuggestionJob } from './types.js';

export async function processPromotionSuggestion(
  payload: PromotionSuggestionJob,
  db: Database,
): Promise<void> {
  const { pushedFiles, commitSha } = payload;
  if (!pushedFiles.length) return;

  const placeholders = pushedFiles.map(() => '?').join(', ');
  const rows = db.prepare(`
    SELECT DISTINCT o.id, o.title, cp.symbol_qualified_name, cp.file_path
    FROM observations o
    JOIN code_provenance cp ON cp.observation_id = o.id
    WHERE o.visibility = 'private'
      AND cp.file_path IN (${placeholders})
  `).all(...pushedFiles) as Array<{ id: number; title: string | null; symbol_qualified_name: string | null; file_path: string }>;

  for (const row of rows) {
    logger.info('WORKER', 'Promotion candidate found', {
      obs_id: row.id,
      symbol: row.symbol_qualified_name,
      file: row.file_path,
      commit: commitSha,
    });
  }
}
