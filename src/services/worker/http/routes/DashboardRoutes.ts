import express, { Request, Response } from 'express';
import { BaseRouteHandler } from '../BaseRouteHandler.js';
import type { DatabaseManager } from '../../DatabaseManager.js';

export class DashboardRoutes extends BaseRouteHandler {
  constructor(private dbManager: DatabaseManager) {
    super();
  }

  setupRoutes(app: express.Application): void {
    app.get('/api/sessions/summary', this.handleSessionsSummary.bind(this));
    app.get('/api/commits/:sha/attribution', this.handleCommitAttribution.bind(this));
    app.get('/api/agents', this.handleAgents.bind(this));
  }

  private handleSessionsSummary = this.wrapHandler((_req: Request, res: Response): void => {
    const db = this.dbManager.getSessionStore().db;
    const now = Date.now();
    const oneHour = 60 * 60 * 1000;
    const oneDay = 24 * oneHour;

    // Get sessions from observations (most recent per session_id)
    const rows = db.prepare(`
      SELECT
        memory_session_id AS sessionId,
        MAX(created_at_epoch) AS lastSeen,
        COUNT(*) AS observationCount,
        MIN(created_at_epoch) AS firstSeen
      FROM observations
      WHERE memory_session_id IS NOT NULL
      GROUP BY memory_session_id
      ORDER BY lastSeen DESC
      LIMIT 200
    `).all() as Array<{
      sessionId: string;
      lastSeen: number;
      observationCount: number;
      firstSeen: number;
    }>;

    let active = 0;
    let idle = 0;
    let ended = 0;

    const sessions = rows.map(r => {
      const age = now - r.lastSeen;
      let phase: 'active' | 'idle' | 'ended';
      if (age < oneHour) {
        phase = 'active';
        active++;
      } else if (age < oneDay) {
        phase = 'idle';
        idle++;
      } else {
        phase = 'ended';
        ended++;
      }
      return {
        sessionId: r.sessionId,
        phase,
        observationCount: r.observationCount,
        lastSeen: r.lastSeen,
      };
    });

    res.json({
      active,
      idle,
      ended,
      total: rows.length,
      sessions,
    });
  });

  private handleCommitAttribution = this.wrapHandler((req: Request, res: Response): void => {
    const sha = typeof req.params.sha === 'string' ? req.params.sha : '';
    if (!sha) {
      res.status(400).json({ ok: false, error: 'sha path parameter is required' });
      return;
    }

    const db = this.dbManager.getSessionStore().db;

    // Check if this commit has Entire-Attribution data in the observations narrative
    // Pattern: "Entire-Attribution: N% agent (M/T lines)"
    const obs = db.prepare(`
      SELECT o.narrative, o.facts, o.text
      FROM observations o
      JOIN code_provenance cp ON cp.observation_id = o.id
      WHERE cp.commit_sha = ?
        AND o.narrative IS NOT NULL
      LIMIT 10
    `).all(sha) as Array<{ narrative: string | null; facts: string | null; text: string | null }>;

    // Try to parse Entire-Attribution trailer from any observation text
    let agentPercent: number | null = null;
    let agentLines: number | null = null;
    let totalLines: number | null = null;

    for (const row of obs) {
      const text = [row.narrative, row.facts, row.text].join(' ');
      const match = text.match(/(\d+)%\s*(?:agent|AI)/i);
      const linesMatch = text.match(/\((\d+)\/(\d+)\s*lines?\)/i);
      if (match) {
        agentPercent = parseInt(match[1], 10);
        if (linesMatch) {
          agentLines = parseInt(linesMatch[1], 10);
          totalLines = parseInt(linesMatch[2], 10);
        }
        break;
      }
    }

    if (agentPercent === null) {
      res.json({ sha, agentPercent: null, agentLines: null, humanLines: null, totalLines: null });
      return;
    }

    res.json({
      sha,
      agentPercent,
      agentLines,
      humanLines: totalLines !== null && agentLines !== null ? totalLines - agentLines : null,
      totalLines,
    });
  });

  private handleAgents = this.wrapHandler((_req: Request, res: Response): void => {
    const db = this.dbManager.getSessionStore().db;
    const now = Date.now();
    const oneHour = 60 * 60 * 1000;

    const rows = db.prepare(`
      SELECT
        COALESCE(o.generated_by_model, s.platform_source, 'unknown') AS model,
        COUNT(*) AS observationCount,
        COUNT(DISTINCT o.memory_session_id) AS sessionCount,
        MAX(o.created_at_epoch) AS lastSeen,
        MIN(o.created_at_epoch) AS firstSeen
      FROM observations o
      LEFT JOIN sdk_sessions s ON o.memory_session_id = s.memory_session_id
      GROUP BY COALESCE(o.generated_by_model, s.platform_source, 'unknown')
      ORDER BY observationCount DESC
      LIMIT 50
    `).all() as Array<{
      model: string;
      observationCount: number;
      sessionCount: number;
      lastSeen: number;
      firstSeen: number;
    }>;

    const agents = rows.map(r => {
      const m = r.model.toLowerCase();
      let agentName: string;
      if (m.includes('claude')) agentName = 'claude-code';
      else if (m.includes('gemini')) agentName = 'gemini-cli';
      else if (m.includes('cursor')) agentName = 'cursor';
      else if (m.includes('gpt') || m.includes('openrouter')) agentName = 'openrouter';
      else if (m.includes('codex')) agentName = 'codex';
      else if (m.includes('windsurf')) agentName = 'windsurf';
      else agentName = r.model;

      return {
        name: agentName,
        model: r.model,
        observationCount: r.observationCount,
        sessionCount: r.sessionCount,
        lastSeen: r.lastSeen,
        firstSeen: r.firstSeen,
        isActive: now - r.lastSeen < oneHour,
      };
    });

    res.json({ agents });
  });
}
