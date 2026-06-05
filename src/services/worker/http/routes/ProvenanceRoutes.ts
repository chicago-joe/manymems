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
    app.get('/api/provenance/commits', this.handleCommits.bind(this));
    app.get('/api/provenance/by-commit', this.handleByCommit.bind(this));
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

  private handleCommits = this.wrapHandler((_req: Request, res: Response): void => {
    const db = this.dbManager.getSessionStore().db;
    const rows = db.prepare(`
      SELECT commit_sha,
             COUNT(*) AS edit_count,
             MIN(occurred_at_epoch) AS earliest_epoch,
             GROUP_CONCAT(DISTINCT file_path) AS files_concat
      FROM code_provenance
      WHERE commit_sha IS NOT NULL AND commit_sha != ''
      GROUP BY commit_sha
      ORDER BY earliest_epoch DESC
      LIMIT 100
    `).all() as Array<{ commit_sha: string; edit_count: number; earliest_epoch: number; files_concat: string }>;
    const commits = rows.map(r => ({
      commit_sha: r.commit_sha,
      edit_count: r.edit_count,
      earliest_epoch: r.earliest_epoch,
      files: (r.files_concat as string).split(',').filter(Boolean),
    }));
    res.json({ commits });
  });

  private handleByCommit = this.wrapHandler((req: Request, res: Response): void => {
    const sha = typeof req.query.sha === 'string' ? req.query.sha : '';
    if (!sha) {
      res.status(400).json({ ok: false, error: 'sha query parameter is required' });
      return;
    }
    const db = this.dbManager.getSessionStore().db;
    // Column name compatibility: installed DB may use symbol_qualified_name/occurred_at_epoch
    const cols = (db.prepare('PRAGMA table_info(code_provenance)').all() as Array<{ name: string }>).map(c => c.name);
    const symCol = cols.includes('symbol_name') ? 'symbol_name' : 'symbol_qualified_name';
    const epochCol = cols.includes('created_at_epoch') ? 'created_at_epoch' : 'occurred_at_epoch';
    const agentCol = cols.includes('agent_type') ? ', cp.agent_type' : '';
    const rows = db.prepare(`
      SELECT cp.id, cp.file_path, cp.line_start, cp.line_end, cp.commit_sha,
             cp.${symCol} AS symbol_name, cp.symbol_kind${agentCol}, cp.${epochCol} AS created_at_epoch,
             up.prompt_text
      FROM code_provenance cp
      LEFT JOIN user_prompts up ON cp.user_prompt_id = up.id
      WHERE cp.commit_sha = ?
      ORDER BY cp.${epochCol} ASC
    `).all(sha);
    res.json({ entries: rows });
  });

  private handleLinkCommit = this.wrapHandler(async (req: Request, res: Response): Promise<void> => {
    const { commit_sha, changed_files, since_epoch } = req.body as z.infer<typeof linkCommitSchema>;
    const store = this.dbManager.getSessionStore();
    const updated = store.linkCommitToProvenance(changed_files, commit_sha, since_epoch);
    logger.info('HTTP', 'Provenance commit backfill', { commit_sha, changed_files: changed_files.length, updated });
    res.json({ ok: true, updated });
  });
}
