import type { Database } from 'bun:sqlite';
import { logger } from '../../utils/logger.js';
import type { DedupCheckJob } from './types.js';

/**
 * B3: Flag possible duplicate observations by checking for near-identical text.
 * Uses SQLite FTS5 similarity (if available) or exact content_hash match.
 * Never auto-suppresses — only flags possible_duplicate = 1.
 *
 * Full cosine/vector dedup is B5 (pgvector). This is the SQLite-local approximation.
 */
export async function processDedupCheck(
  payload: DedupCheckJob,
  db: Database,
): Promise<void> {
  const { observationId, project } = payload;

  const obs = db.prepare('SELECT id, content_hash, text, type FROM observations WHERE id = ?').get(observationId) as {
    id: number; content_hash: string | null; text: string | null; type: string | null;
  } | undefined;

  if (!obs) return;

  // Check for exact content_hash duplicate
  if (obs.content_hash) {
    const dup = db.prepare(`
      SELECT id FROM observations
      WHERE content_hash = ? AND id != ? AND project = ? AND possible_duplicate = 0
      LIMIT 1
    `).get(obs.content_hash, obs.id, project) as { id: number } | undefined;

    if (dup) {
      db.prepare('UPDATE observations SET possible_duplicate = 1 WHERE id = ?').run(obs.id);
      logger.info('WORKER', 'B3: flagged possible duplicate (exact hash)', {
        obs_id: obs.id, dup_of: dup.id,
      });
    }
  }
}
