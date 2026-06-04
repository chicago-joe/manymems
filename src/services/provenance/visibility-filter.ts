
export interface VisibilityContext {
  team_id?: string;
  actor_id?: string;
}

export interface VisibilityFilter {
  sql: string;
  params: unknown[];
}

/**
 * Builds a WHERE clause fragment enforcing visibility scoping.
 *
 * In local single-user mode (no team_id), returns an empty fragment so existing
 * behaviour is unchanged. In server-beta mode, restricts results to:
 *   team_id = context.team_id AND (visibility IN ('team','org') OR actor_id = context.actor_id)
 */
export function buildVisibilityFilter(context: VisibilityContext): VisibilityFilter {
  if (!context.team_id) {
    return { sql: '', params: [] };
  }

  if (!context.actor_id) {
    return {
      sql: "AND team_id = ? AND visibility IN ('team', 'org')",
      params: [context.team_id],
    };
  }

  return {
    sql: "AND team_id = ? AND (visibility IN ('team', 'org') OR actor_id = ?)",
    params: [context.team_id, context.actor_id],
  };
}
