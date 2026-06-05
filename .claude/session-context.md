# manymems — Session Context

_Last updated: 2026-06-05_

## What this project is

**manymems** is an open-source (Apache-2.0) team-memory system for multi-session, multi-modal
agentic coding agents. It is **built on a snapshot of [claude-mem](https://github.com/thedotmack/claude-mem)**
(Apache-2.0, Alex Newman) — **not a tracking fork**. No upstream sync, no contributing back. The
work genuinely extends claude-mem's source, so it is a derivative work; attribution is preserved in
`NOTICE`, `LICENSE`, and the README "License & attribution" section.

Two headline capabilities on top of claude-mem's existing server-beta substrate:
- **Track A — Intent→Code Provenance:** link each developer prompt to the exact lines it changed,
  anchored by tree-sitter symbols so the link survives later edits ("why was this written?").
- **Track B — Team multi-session memory:** identity, visibility/privacy, promotion, conflict/staleness,
  multi-modal capture, team-scoped retrieval.

Master plan: `plans/00-team-intent-memory-master-plan.md` (12 phases, with verified `file:line` anchors).

## Repo / environment

- **Single repo** at `~/PyCharmProjects/manymems/` → `github.com/chicago-joe/manymems`, branch `main`, synced.
  (Was previously two nested repos; flattened on 2026-06-04. Old outer history backed up at
  `/tmp/manymems-outer-e92fa71-backup.bundle`.)
- **Stack:** TypeScript + Bun. SQLite (`bun:sqlite`) local + Postgres/BullMQ/Valkey server-beta;
  Chroma vectors; tree-sitter; MCP server.
- **Run tests/build:** `bun` is at `~/.bun/bin` (NOT on PATH — prefix `export PATH="$PATH:/home/chicagojoe/.bun/bin"`).
  Worktrees need `bun install` + `bun pm trust tree-sitter` or grammars don't load.

## Done & committed (on `main`)

| Phase | What | Commit |
|---|---|---|
| A1 | Edit/Write line-range + content-hash extraction (cheap, hot-path) | `693b89e` |
| A2 | Tree-sitter symbol anchors + signature-hash staleness | `693b89e` |
| B1/B1.3 | Four-part identity (org/actor/agent_tool/session) + visibility columns + namespace filter | `05e62c8` |
| A3 | `code_provenance` table (SQLite mig 36 + Postgres) + prompt→code FK + worker wiring | `d6f0d52` |
| A4 | Commit-SHA backfill (`/api/provenance/link-commit` + git post-commit hook installer) | `2a87b3d` |
| A5 | `get_code_provenance` MCP tool + `query.ts` (symbol-aware resolution + live staleness) | `2a87b3d` |
| perf | Content-addressed tree-sitter parse cache (4600ms→<1ms on repeats) | `d5e3e86` |
| docs | manymems identity + Apache-2.0 attribution | `e2250ca` |

**Track A is functionally complete.** Provenance source: `src/services/provenance/{extract-line-range,symbol-anchor,store,query,commit-hook,visibility-filter}.ts`.
Tests: `tests/provenance/*.test.ts` (39 pass) + 189 across hook/sqlite/context.

## Hard-won gotchas (do not relearn)

1. **Two SQLite migration chains.** `SessionStore` constructor runs its OWN inline migration chain
   (used by `SessionStore(':memory:')` + `ContextBuilder`), SEPARATE from `MigrationRunner`
   (used by `Database.ts` → real worker). **Every migration must be added to BOTH.** A3 caught this
   when the table existed in one chain only. Assigned next: B2=37, B3=38, B4=39.
2. **Tree-sitter parse = subprocess spawn** (`runBatchQuery` execs the tree-sitter CLI), ~2.4s/call.
   The content-addressed cache (`parser.ts`) amortizes repeats; first parse still costs. Symbol
   anchoring is therefore OFF the capture hot path — `extractEditChanges` (cheap) runs on the hook;
   `resolveProvenanceSymbols` (tree-sitter) runs fire-and-forget worker-side in `ingestObservation`.
3. **No node_modules in fresh worktrees** → tree-sitter silently returns 0 symbols and tests that
   skip-on-null pass falsely. Always `bun install` + trust grammar per worktree.
4. **Tree-sitter tests need `}, 30000)` timeouts** (default 5s is too short for the subprocess).

## Per-phase testing contract (enforce every phase)

- **L1 unit** (pure fns) + **L2 SQLite `:memory:` round-trip** — MANDATORY every phase.
- **L3 pipeline** (hook-lifecycle / context-injection) — for A5 + injection paths.
- **L4 Docker e2e** (`scripts/e2e-server-beta-docker.sh`) — for B3 async jobs + B5 pgvector
  (pgvector can ONLY be tested here — needs the `vector` extension in the Postgres image).

## Next steps (not started)

- **B2** promotion (private→team, mig 37), **B3** conflict/staleness async BullMQ jobs (mig 38),
  **B4** multi-modal MAU (mig 39), **B5** pgvector + team-scoped scope-weighted ranking.
- Draft worker instruction files exist at `/tmp/worker-b{2,3,4,5}-instructions.md` — update them with
  the testing contract, dual-migration-chain rule, per-worktree `bun install`, and 30s test timeouts
  before use.
- Optional: wire `installPostCommitHook` into `claude-mem install`; consider in-process tree-sitter
  bindings to kill the ~2.4s first-parse cost before B3/B5 lean harder on parsing.
- **Recommended build mode:** direct/sequential (caught the migration-chain + perf bugs that the
  parallel csd workers' narrow unit tests missed).

## Memory pointers

- `manymems-project-goal.md` — what the project is + master plan location
- `manymems-build-checkpoint.md` — detailed build progress, decisions, gotchas (the authoritative checkpoint)
# hook e2e marker
