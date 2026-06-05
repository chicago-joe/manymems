// SPDX-License-Identifier: Apache-2.0

import express, { Request, Response } from 'express';
import { z } from 'zod';
import type { PostgresObservationRepository } from './observations.js';

const semanticContextSchema = z.object({
  embedding: z.array(z.number()).length(384),
  teamId: z.string(),
  projectId: z.string(),
  actorId: z.string().optional(),
  entityName: z.string().optional(),
  limit: z.number().int().min(1).max(50).optional(),
});

/**
 * B5: POST /v1/context/semantic — scope-weighted semantic retrieval for context injection.
 * Closes the TODO at session-init.ts:73 for server-beta semantic search.
 */
export function registerSemanticContextRoute(
  app: express.Application,
  obsRepo: PostgresObservationRepository,
): void {
  app.post('/v1/context/semantic', async (req: Request, res: Response) => {
    const parsed = semanticContextSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid request', details: parsed.error.issues });
      return;
    }
    try {
      const results = await obsRepo.searchSemantic(parsed.data);
      res.json({
        results: results.map(r => ({
          id: r.id,
          text: r.content,
          title: (r.metadata as Record<string, unknown>)?.title ?? null,
          similarity: r.similarity,
          scope_weight: r.scope_weight,
          actor_id: r.actorId,
          visibility: r.visibility,
        })),
      });
    } catch (err) {
      const msg = (err as Error).message ?? String(err);
      if (msg.includes('operator does not exist') || msg.includes('pgvector')) {
        res.status(501).json({ error: 'pgvector not enabled on this server', hint: 'Run migratePostgresForPgvector()' });
        return;
      }
      res.status(500).json({ error: msg });
    }
  });
}
