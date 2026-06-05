import express, { Request, Response } from 'express';
import { z } from 'zod';
import { BaseRouteHandler } from '../BaseRouteHandler.js';
import { validateBody } from '../middleware/validateBody.js';
import { logger } from '../../../../utils/logger.js';
import type { DatabaseManager } from '../../DatabaseManager.js';

const promoteSchema = z.object({
  visibility: z.enum(['team', 'org']),
  promoted_by: z.string().optional(),
});

export class ObservationRoutes extends BaseRouteHandler {
  constructor(private dbManager: DatabaseManager) {
    super();
  }

  setupRoutes(app: express.Application): void {
    app.post('/api/observations/:id/promote', validateBody(promoteSchema), this.handlePromote.bind(this));
  }

  private handlePromote = this.wrapHandler((req: Request, res: Response): void => {
    const id = req.params['id'] as string;
    const { visibility, promoted_by } = req.body as z.infer<typeof promoteSchema>;
    const db = this.dbManager.getSessionStore().db;

    const row = db.prepare('SELECT id, visibility FROM observations WHERE id = ?').get(id) as { id: number; visibility: string } | undefined;
    if (!row) {
      res.status(404).json({ error: 'not found' });
      return;
    }
    if (row.visibility === visibility) {
      res.json({ ok: true, id, new_visibility: visibility, already_promoted: true });
      return;
    }

    const now = Date.now();
    db.prepare(
      'UPDATE observations SET visibility = ?, promoted_at = ?, promoted_by = ? WHERE id = ?'
    ).run(visibility, now, promoted_by ?? null, id);

    logger.info('HTTP', 'Observation promoted', { id, visibility, promoted_by });
    res.json({ ok: true, id, new_visibility: visibility, promoted_at: now });
  });
}
