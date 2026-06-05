import express, { Request, Response } from 'express';
import { z } from 'zod';
import { BaseRouteHandler } from '../BaseRouteHandler.js';
import { validateBody } from '../middleware/validateBody.js';
import { logger } from '../../../../utils/logger.js';
import type { DatabaseManager } from '../../DatabaseManager.js';
import { getCodeProvenance } from '../../../provenance/query.js';

// A4: backfill commit SHA onto provenance rows after a git commit lands.
const linkCommitSchema = z.object({
  commit_sha: z.string().trim().min(7),
  changed_files: z.array(z.string().trim().min(1)).min(1),
  since_epoch: z.number().int().nonnegative().optional(),
}).strict();

export class ProvenanceRoutes extends BaseRouteHandler {
  constructor(private dbManager: DatabaseManager) {
    super();
  }

  setupRoutes(app: express.Application): void {
    app.post('/api/provenance/link-commit', validateBody(linkCommitSchema), this.handleLinkCommit.bind(this));
    app.get('/api/provenance/by-line', this.handleByLine.bind(this));
  }

  // A5: "why was this written" — symbol-aware provenance + staleness for file:line.
  private handleByLine = this.wrapHandler(async (req: Request, res: Response): Promise<void> => {
    const file = typeof req.query.file === 'string' ? req.query.file : '';
    const line = Number(req.query.line);
    const includePrompt = req.query.include_prompt !== 'false';
    if (!file || !Number.isInteger(line) || line < 1) {
      res.status(400).json({ ok: false, error: 'file (string) and line (positive integer) are required' });
      return;
    }
    const store = this.dbManager.getSessionStore();
    const result = await getCodeProvenance(store, file, line, includePrompt);
    // MCP content shape so the get_code_provenance tool can forward verbatim.
    res.json({ content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] });
  });

  private handleLinkCommit = this.wrapHandler(async (req: Request, res: Response): Promise<void> => {
    const { commit_sha, changed_files, since_epoch } = req.body as z.infer<typeof linkCommitSchema>;
    const store = this.dbManager.getSessionStore();
    const updated = store.linkCommitToProvenance(changed_files, commit_sha, since_epoch);
    logger.info('HTTP', 'Provenance commit backfill', { commit_sha, changed_files: changed_files.length, updated });
    res.json({ ok: true, updated });
  });
}
