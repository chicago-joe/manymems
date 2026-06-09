// SPDX-License-Identifier: Apache-2.0

import type { Application, Request, Response } from 'express';
import type { RouteHandler } from '../../../services/server/Server.js';
import type { PostgresPool } from '../../../storage/postgres/pool.js';
import { PostgresTeamsRepository } from '../../../storage/postgres/teams.js';
import { logger } from '../../../utils/logger.js';
import { requirePostgresServerAuth } from '../../middleware/postgres-auth.js';

export interface ServerV1TeamsRoutesOptions {
  pool: PostgresPool;
  authMode?: string;
  allowLocalDevBypass?: boolean;
}

export class ServerV1TeamsRoutes implements RouteHandler {
  constructor(private readonly options: ServerV1TeamsRoutesOptions) {}

  setupRoutes(app: Application): void {
    const readAuth = requirePostgresServerAuth(this.options.pool, {
      authMode: this.options.authMode,
      allowLocalDevBypass: this.options.allowLocalDevBypass,
      requiredScopes: ['memories:read'],
    });

    // GET /v1/teams — list teams visible to the authenticated API key.
    // Server-beta API keys are team-scoped; we return the single bound team.
    // If the key carries an actor_id we could fan out, but that field is not
    // propagated through authContext today — returning the bound team is safe.
    app.get('/v1/teams', readAuth, this.asyncHandler(async (req, res) => {
      const teamId = this.requireTeamId(req, res);
      if (!teamId) return;
      try {
        const result = await this.options.pool.query<{
          id: string;
          name: string;
          metadata: unknown;
          created_at: Date;
          updated_at: Date;
        }>(
          `SELECT * FROM teams WHERE id = $1`,
          [teamId],
        );
        res.status(200).json({ teams: result.rows });
      } catch (error) {
        this.handleDbError(error, res, 'teams.list');
      }
    }));

    // GET /v1/teams/:teamId — get a specific team (must belong to auth context)
    app.get('/v1/teams/:teamId', readAuth, this.asyncHandler(async (req, res) => {
      const callerTeamId = this.requireTeamId(req, res);
      if (!callerTeamId) return;
      const teamId = String(req.params['teamId'] ?? '');
      try {
        const repo = new PostgresTeamsRepository(this.options.pool);
        const team = await repo.getByIdForUser({ id: teamId, userId: callerTeamId });
        if (!team) {
          res.status(404).json({ error: 'NotFound', message: 'Team not found' });
          return;
        }
        res.status(200).json(team);
      } catch (error) {
        this.handleDbError(error, res, 'teams.getById');
      }
    }));

    // GET /v1/teams/:teamId/members — list members of a team
    app.get('/v1/teams/:teamId/members', readAuth, this.asyncHandler(async (req, res) => {
      const callerTeamId = this.requireTeamId(req, res);
      if (!callerTeamId) return;
      const teamId = String(req.params['teamId'] ?? '');
      // Caller must belong to the same team they are querying
      if (callerTeamId !== teamId) {
        res.status(403).json({ error: 'Forbidden', message: 'API key is not bound to the requested team' });
        return;
      }
      try {
        const repo = new PostgresTeamsRepository(this.options.pool);
        const members = await repo.listMembers(teamId);
        res.status(200).json({ members });
      } catch (error) {
        this.handleDbError(error, res, 'teams.listMembers');
      }
    }));

    // GET /v1/api-keys — list API keys for the authenticated team
    app.get('/v1/api-keys', readAuth, this.asyncHandler(async (req, res) => {
      const teamId = this.requireTeamId(req, res);
      if (!teamId) return;
      try {
        const result = await this.options.pool.query<{
          id: string;
          actor_id: string;
          created_at: Date;
          revoked_at: Date | null;
        }>(
          `SELECT id, actor_id, created_at, revoked_at
           FROM api_keys
           WHERE team_id = $1
           ORDER BY created_at DESC`,
          [teamId],
        );
        res.status(200).json({ api_keys: result.rows });
      } catch (error) {
        this.handleDbError(error, res, 'api-keys.list');
      }
    }));
  }

  private requireTeamId(req: Request, res: Response): string | null {
    const teamId = req.authContext?.teamId ?? null;
    if (!teamId) {
      res.status(403).json({ error: 'Forbidden', message: 'API key is not bound to a team' });
      return null;
    }
    return teamId;
  }

  private handleDbError(error: unknown, res: Response, action: string): void {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('SYSTEM', `${action} failed`, { error: message });
    res.status(500).json({ error: 'InternalError', message: 'Request failed' });
  }

  private asyncHandler(fn: (req: Request, res: Response) => Promise<void>) {
    return (req: Request, res: Response, next: (err?: unknown) => void): void => {
      fn(req, res).catch(next);
    };
  }
}
