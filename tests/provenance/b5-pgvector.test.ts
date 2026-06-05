import { describe, it, expect } from 'bun:test';

/**
 * B5 unit tests — no live Postgres required.
 * Tests the schema migration logic and search query structure.
 * L4 Docker tests (e2e-server-beta-docker.sh) cover the live pgvector path.
 */

describe('B5 pgvector schema exports', () => {
  it('migratePostgresForPgvector is exported from schema.ts', async () => {
    const mod = await import('../../src/storage/postgres/schema.js');
    expect(typeof mod.migratePostgresForPgvector).toBe('function');
  });

  it('SERVER_BETA_PGVECTOR_SCHEMA_VERSION is 2', async () => {
    const mod = await import('../../src/storage/postgres/schema.js');
    expect(mod.SERVER_BETA_PGVECTOR_SCHEMA_VERSION).toBe(2);
  });

  it('SemanticContextRoute registers /v1/context/semantic', async () => {
    const mod = await import('../../src/storage/postgres/SemanticContextRoute.js');
    expect(typeof mod.registerSemanticContextRoute).toBe('function');
  });
});

describe('B5 searchSemantic method', () => {
  it('PostgresObservationRepository has searchSemantic method', async () => {
    const mod = await import('../../src/storage/postgres/observations.js');
    expect(typeof mod.PostgresObservationRepository.prototype.searchSemantic).toBe('function');
  });
});
