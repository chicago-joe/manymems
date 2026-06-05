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

const multimodalSchema = z.object({
  project: z.string(),
  modality: z.enum(['text', 'screenshot', 'diagram', 'voice_transcript', 'code']),
  content_pointer: z.string().optional(),
  content_summary: z.string(),
  memory_session_id: z.string().optional(),
});

export class ObservationRoutes extends BaseRouteHandler {
  constructor(private dbManager: DatabaseManager) {
    super();
  }

  setupRoutes(app: express.Application): void {
    app.post('/api/observations/:id/promote', validateBody(promoteSchema), this.handlePromote.bind(this));
    app.get('/api/observations/:id/staleness', this.handleGetStaleness.bind(this));
    app.post('/api/observations/multimodal', validateBody(multimodalSchema), this.handleAddMultimodal.bind(this));
    app.get('/api/observations/:id/content', this.handleGetContent.bind(this));
  }

  private handleGetStaleness = this.wrapHandler((req: Request, res: Response): void => {
    const id = req.params['id'] as string;
    const db = this.dbManager.getSessionStore().db;
    const row = db.prepare(
      'SELECT id, stale, stale_reason, last_valid_commit FROM observations WHERE id = ?'
    ).get(id) as { id: number; stale: number; stale_reason: string | null; last_valid_commit: string | null } | undefined;
    if (!row) {
      res.status(404).json({ error: 'not found' });
      return;
    }
    res.json(row);
  });

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

  private handleAddMultimodal = this.wrapHandler((req: Request, res: Response): void => {
    const body = req.body as z.infer<typeof multimodalSchema>;
    const store = this.dbManager.getSessionStore();
    const db = store.db;
    const now = Date.now();
    const id = crypto.randomUUID();

    // Resolve or create a standalone SDK session when no memory_session_id is supplied.
    // observations.memory_session_id is NOT NULL with a FK to sdk_sessions.
    let memorySessionId = body.memory_session_id;
    if (!memorySessionId) {
      const standaloneContentSessionId = `standalone-multimodal-${crypto.randomUUID()}`;
      memorySessionId = `mm-${crypto.randomUUID()}`;
      const sessionDbId = store.createSDKSession(
        standaloneContentSessionId,
        body.project,
        `[multimodal capture] ${body.content_summary.slice(0, 80)}`,
        undefined,
        'multimodal',
      );
      store.updateMemorySessionId(sessionDbId, memorySessionId);
    }

    db.prepare(`
      INSERT INTO observations
        (memory_session_id, project, text, type, title, content_hash, visibility,
         modality, content_pointer, content_summary, created_at, created_at_epoch)
      VALUES (?, ?, ?, 'multimodal', ?, ?, 'private', ?, ?, ?, datetime('now'), ?)
    `).run(
      memorySessionId,
      body.project,
      body.content_summary,
      body.content_summary.slice(0, 120),
      id,
      body.modality,
      body.content_pointer ?? null,
      body.content_summary,
      now,
    );

    logger.info('HTTP', 'Multimodal observation added', { modality: body.modality, project: body.project });
    res.status(201).json({ ok: true, id });
  });

  private handleGetContent = this.wrapHandler((req: Request, res: Response): void => {
    const idParam = req.params['id'] as string;
    const level = typeof req.query['level'] === 'string' ? req.query['level'] : 'L1';
    const db = this.dbManager.getSessionStore().db;

    // Support both integer row id and UUID content_hash (used by multimodal POST).
    const isIntId = /^\d+$/.test(idParam);
    const row = isIntId
      ? db.prepare(
          'SELECT id, content_hash, modality, content_pointer, content_summary, text FROM observations WHERE id = ?'
        ).get(Number(idParam)) as { id: number; content_hash: string; modality: string; content_pointer: string | null; content_summary: string | null; text: string | null } | undefined
      : db.prepare(
          'SELECT id, content_hash, modality, content_pointer, content_summary, text FROM observations WHERE content_hash = ?'
        ).get(idParam) as { id: number; content_hash: string; modality: string; content_pointer: string | null; content_summary: string | null; text: string | null } | undefined;

    if (!row) {
      res.status(404).json({ error: 'not found' });
      return;
    }

    // Return content_hash as id for consistency with multimodal POST (which returns the UUID).
    const responseId = row.content_hash ?? String(row.id);
    if (level === 'L3' && row.content_pointer) {
      res.json({ id: responseId, modality: row.modality, content_pointer: row.content_pointer });
      return;
    }
    if (level === 'L2') {
      res.json({ id: responseId, modality: row.modality, content_summary: row.content_summary, text: row.text });
      return;
    }
    res.json({ id: responseId, modality: row.modality, content_summary: row.content_summary });
  });
}
