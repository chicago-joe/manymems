import { describe, it, expect } from 'bun:test';
import { buildVisibilityFilter } from '../../src/services/provenance/visibility-filter.js';

describe('buildVisibilityFilter', () => {
  it('returns empty filter in local single-user mode (no team_id)', () => {
    const result = buildVisibilityFilter({});
    expect(result.sql).toBe('');
    expect(result.params).toEqual([]);
  });

  it('returns empty filter when context is explicitly empty', () => {
    const result = buildVisibilityFilter({ team_id: undefined, actor_id: undefined });
    expect(result.sql).toBe('');
    expect(result.params).toEqual([]);
  });

  it('returns team-scoped filter when only team_id is present (no actor)', () => {
    const result = buildVisibilityFilter({ team_id: 'team-123' });
    expect(result.sql).toContain('team_id = ?');
    expect(result.sql).toContain("visibility IN ('team', 'org')");
    expect(result.params).toEqual(['team-123']);
  });

  it('returns full filter with team_id and actor_id', () => {
    const result = buildVisibilityFilter({ team_id: 'team-abc', actor_id: 'user-xyz' });
    expect(result.sql).toContain('team_id = ?');
    expect(result.sql).toContain("visibility IN ('team', 'org')");
    expect(result.sql).toContain('actor_id = ?');
    expect(result.params).toEqual(['team-abc', 'user-xyz']);
  });

  it('filter SQL includes AND prefix so it can be appended to a WHERE clause', () => {
    const result = buildVisibilityFilter({ team_id: 'team-abc', actor_id: 'user-xyz' });
    expect(result.sql.trimStart()).toMatch(/^AND /);
  });
});
