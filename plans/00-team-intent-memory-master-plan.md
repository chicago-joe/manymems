# manymems — Master Plan: Team Memory with Intent→Code Provenance

**Goal:** Fork/extend claude-mem (v13.4.0) into a memory-management system for a **team** of developers using **multi-modal, multi-session agentic coding agents** (Claude Code, Cursor, Codex, Windsurf, OpenCode). Two headline capabilities on top of the existing server-beta substrate:

- **A. Intent→Code Provenance** — tie the developer's intent (the prompt) and the agent's actions to the **actual lines of code that changed**, durably anchored so the link survives later edits ("git blame, but with intent").
- **B. Team multi-session / multi-modal memory** — shared memory across developers and agents with identity, privacy, promotion, conflict/staleness handling, multi-modal capture, and team-scoped retrieval.

This plan is **phased and self-contained per phase**. Each phase cites verified `file:line` anchors from the codebase so it can be executed in a fresh context. **All citations were verified by parallel exploration agents on 2026-06-02** — re-verify with `git log`/Grep before editing, since the codebase evolves.

---

## Phase 0 — Documentation Discovery (DONE — consolidated findings)

### 0.1 Architecture facts (verified, with anchors)

**Capture → compression → store pipeline (local SQLite worker, default mode):**
1. PostToolUse hook → `claudeCodeAdapter.normalizeInput` `src/cli/adapters/claude-code.ts:9`
2. `observationHandler.execute` `src/cli/handlers/observation.ts:42` → POST `/api/sessions/observations`
3. `ingestObservation` `src/services/worker/http/shared.ts:97` → `sessionManager.queueObservation` `src/services/worker/SessionManager.ts:156`
4. In-RAM `SessionMessageBuffer` → `ClaudeProvider.createMessageGenerator` `src/services/worker/ClaudeProvider.ts:384`
5. `query()` from `@anthropic-ai/claude-agent-sdk` `src/services/worker/ClaudeProvider.ts:214`; prompts in `src/sdk/prompts.ts` (`buildObservationPrompt` line 81)
6. `processAgentResponse` `src/services/worker/agents/ResponseProcessor.ts:26` → `parseAgentXml` → `storeObservations`
7. Raw insert `src/services/sqlite/observations/store.ts:19` (`ON CONFLICT(memory_session_id, content_hash) DO NOTHING`)

**Prompt (intent) capture today:** `UserPromptSubmit` → `sessionInitHandler.execute` `src/cli/handlers/session-init.ts:31`; prompt stored in `user_prompts` table (`content_session_id, prompt_number, prompt_text`). Semantic inject (optional) at `session-init.ts:131-161` when `CLAUDE_MEM_SEMANTIC_INJECT=true`.

**Session ID model** (`docs/SESSION_ID_ARCHITECTURE.md`): dual IDs — `content_session_id` (from the tool) and `memory_session_id` (SDK-assigned). Observations FK on `memory_session_id`.

**Multi-tool adapters** (`src/cli/adapters/index.ts:9-20`, interface `src/cli/types.ts:39`): `claude-code`, `codex`, `cursor`, `gemini`/`gemini-cli`, `windsurf`, `raw`. Platform normalized via `src/shared/platform-source.ts`. `agent_id`/`agent_type` already threaded through `NormalizedHookInput`.

**Storage / retrieval:**
- SQLite schema `src/services/sqlite/schema.sql` (migration tip 34): `sdk_sessions`, `observations` (cols incl. `files_read`, `files_modified`, `prompt_number`, `agent_type`, `agent_id`, `content_hash`), `session_summaries`, `pending_messages`, `user_prompts`, `observation_feedback`. FTS5 virtual tables on demand.
- Chroma vectors: model `all-MiniLM-L6-v2` via `uvx chroma-mcp@0.2.6`; `src/services/sync/ChromaSync.ts`, `ChromaMcpManager.ts:28`. Per-project collections `cm__<project>`. Optional (falls back to FTS5).
- MCP server `src/servers/mcp-server.ts`: `search`, `timeline`, `get_observations`, `smart_search/unfold/outline` (tree-sitter, `src/services/smart-file-read/`), corpus tools, plus server-beta REST tools (`observation_add/search/context`).

**Server-beta (team substrate — ALREADY BUILT, PR #2383):**
- Postgres schema `src/storage/postgres/schema.ts` (v1): `teams`, `projects`, `team_members`, `api_keys`, `audit_log`, `server_sessions`, `agent_events`, `observation_generation_jobs`, `observations`, `observation_sources`.
- `observations.content_search TSVECTOR` GIN index (`schema.ts:219,284`); `observations.embedding JSONB` reserved but **unused** (no pgvector yet).
- Auth: SHA-256 API keys, `requirePostgresServerAuth` re-validates per request; better-auth (`src/server/auth/auth.ts`) with `apiKey()`+`organization()` plugins. Identity triad `team_id × project_id`, `api_key_id`, `actor_id`, `request_id` on every row/job.
- Queue: BullMQ + Valkey/Redis (`src/server/jobs/ServerJobQueue.ts`, `src/server/queue/redis-config.ts`); job processor `src/server/generation/ProviderObservationGenerator.ts:69`. Outbox/reconcile pattern.
- Providers pluggable: `generate(input)→{rawText,modelId,providerLabel}` (Claude/Gemini/OpenRouter today; Vertex AI is the gap — issue #2522).

### 0.2 What already exists vs. what we build

| Capability | Status in claude-mem | This plan |
|---|---|---|
| Team identity (team/project/actor/api-key) | **Built** (server-beta) | Reuse; extend with `agent_tool_id`, `visibility` |
| Multi-tool adapters | **Built** | Reuse; enrich edit-event extraction |
| Prompt capture (`user_prompts`) | **Built** (text + prompt_number) | Add FK linkage prompt→observation→code |
| Intent→**line range** provenance | **NOT built** (only `files_modified` paths) | **Phase A** (core novelty) |
| Vector search in server-beta | **NOT built** (embedding col unused) | Phase B5 (pgvector) |
| Private→team promotion / visibility | **NOT built** (only `<private>` tags) | Phase B2 |
| Conflict / staleness / dedup | **NOT built** (planned only) | Phase B3 |
| Multi-modal (screenshots/voice) | **NOT built** (`payload jsonb` ready) | Phase B4 |
| Team-scoped retrieval ranking | **NOT built** (keyword GIN only) | Phase B5 |

### 0.3 Allowed APIs (cite-before-use; do NOT invent)

- Claude Code PostToolUse payload: `{session_id, transcript_path, cwd, hook_event_name, tool_name, tool_input{file_path,old_string,new_string}, tool_output}`. **No `tool_use_id` in the hook payload** — order edits by `created_at_epoch`. (Source: code.claude.com/docs/en/hooks, verified against `src/cli/adapters/claude-code.ts`.)
- Tree-sitter symbol extraction already available: `src/services/smart-file-read/parser.ts` → `CodeSymbol{name, kind, lineStart, lineEnd, parent, signature}`.
- SDK provider contract: `generate(input)→{rawText, modelId, providerLabel}` `docs/server-beta-architecture-and-team-vision.md §9.4`.
- Postgres bootstrap: `bootstrapServerBetaPostgresSchema()` `src/storage/postgres/schema.ts`.

**Anti-patterns (do NOT do):**
- Do not make Claude Code the core data model — keep the generic `AgentEvent` path (`plans/.../team-auth.md` Phase 9, anti-pattern guard).
- Do not use raw line numbers as the *primary* code anchor — they drift. Use tree-sitter symbol anchor + signature hash (Phase A2).
- Do not add pgvector assuming it exists — `embedding` is `JSONB` and unused; pgvector is a deliberate Phase B5 task.
- Do not block the observation write path with LLM conflict checks — defer to BullMQ async (Phase B3).
- Do not auto-resolve contradictions — link + flag for review (no published system resolves these reliably).

---

## TRACK A — Intent → Code-Line Provenance (core novelty)

### Phase A1 — Capture edit events with deterministic line ranges

**What to implement (copy the deterministic recipe, do not invent diffing):**
In the PostToolUse observation path, add a pre-processing stage for `Edit`/`Write`/`MultiEdit` tools that computes line ranges *after the edit lands*:
1. Read `tool_input.file_path`, `old_string`, `new_string` from the normalized hook input (extend `NormalizedHookInput` in `src/cli/types.ts:39`).
2. Read the file (edit already applied). Find `new_string` position; `line_start = count('\n') before match + 1`; `line_end = line_start + new_string.count('\n')`. For `replace_all`/MultiEdit, record **all** match ranges.
3. For `Write`: range is `[1, content.count('\n')+1]`.
4. Hash `old_string`/`new_string` with SHA-256 (Bun/Node built-in).

**Where:** new module `src/services/provenance/extract-line-range.ts`; call from `src/services/worker/http/shared.ts:97` (`ingestObservation`) when `tool_name ∈ {Edit, Write, MultiEdit}`. Thread fields through `SessionManager.queueObservation` `src/services/worker/SessionManager.ts:156`.

**Verification:** unit test in `tests/provenance/` feeding a synthetic Edit payload + temp file → asserts correct `line_start/line_end`; test `replace_all` multi-range; test Write whole-file.

**Anti-pattern guards:** no `tool_use_id` reliance (order by epoch); handle `new_string` appearing multiple times (use match nearest to where old_string was).

### Phase A2 — Durable symbol anchors (tree-sitter) + staleness hash

**What to implement (reuse existing parser):**
- For each `EditChange`, parse the post-edit file with the existing tree-sitter parser `src/services/smart-file-read/parser.ts` → find the `CodeSymbol` whose `[lineStart,lineEnd]` contains the edit. Build:
  `SymbolAnchor{qualified_name (parent.name), kind, signature_hash=sha256(signature), line_offset_from_symbol_start}`.
- Primary anchor = symbol qualified name; `signature_hash` = staleness detector; raw line range stored only as a captured-at snapshot.

**Where:** `src/services/provenance/symbol-anchor.ts`. Reuse the grammar registry already bundled (`package.json` devDeps list 20+ `tree-sitter-*`).

**Verification:** test that editing function B does not invalidate anchor for function A; test that editing A's body changes A's `signature_hash` only if signature changes; test fallback to line-range overlap when edit lands outside any named symbol.

**Anti-pattern guards:** anchor survives unrelated edits (don't store absolute line as primary); renames break the name anchor — acceptable for v1, note as known gap.

### Phase A3 — `code_provenance` schema + prompt linkage

**What to implement (copy the schema; adapt to SQLite + Postgres):**
SQLite migration (next version after 34) and Postgres migration adding:
```sql
CREATE TABLE code_provenance (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  team_id TEXT,                  -- server-beta scope
  actor_id TEXT,                 -- human identity
  agent_tool_id TEXT,            -- claude-code|cursor|codex|windsurf|opencode
  agent_id TEXT,                 -- subagent distinction (from hook)
  session_id TEXT,
  user_prompt_id TEXT,           -- FK → user_prompts.id  (THE intent link)
  observation_id TEXT,           -- FK → observations
  file_path TEXT NOT NULL,       -- relative to project root
  line_start INTEGER NOT NULL,
  line_end INTEGER NOT NULL,
  symbol_qualified_name TEXT,
  symbol_kind TEXT,
  signature_hash TEXT,           -- staleness
  old_content_hash TEXT,
  new_content_hash TEXT,
  commit_sha TEXT,               -- backfilled by post-commit hook (A4)
  stale INTEGER DEFAULT 0,
  occurred_at_epoch INTEGER NOT NULL
);
CREATE INDEX idx_prov_file_line ON code_provenance(file_path, line_start, line_end);
CREATE INDEX idx_prov_symbol ON code_provenance(file_path, symbol_qualified_name);
CREATE INDEX idx_prov_prompt ON code_provenance(user_prompt_id);
```
Key linkage: on each `EditChange`, look up the `user_prompts` row for `(content_session_id, prompt_number)` → store its id as `user_prompt_id`. All edits in one turn share one `user_prompt_id` (correct: one intent → many changes).

**Where:** SQLite schema `src/services/sqlite/schema.sql` + migration runner; Postgres `src/storage/postgres/schema.ts` (`bootstrapServerBetaPostgresSchema`). Store helper `src/services/provenance/store.ts`.

**Verification:** integration test — simulate prompt + 3 edits → assert 3 `code_provenance` rows all sharing `user_prompt_id`, each with correct symbol anchor. `npm run typecheck` clean.

### Phase A4 — Commit SHA backfill (git post-commit hook)

**What to implement:** optional git `post-commit` hook installed by `claude-mem install`. On commit: `git diff-tree --no-commit-id -r --name-only HEAD` → POST to worker `/api/provenance/link-commit` → set `commit_sha` on rows where `file_path IN (changed)` AND `commit_sha IS NULL` AND `occurred_at_epoch > prev_commit_time`. Borrow GitHub Copilot's `Agent-Logs-Url` idea: also write a commit trailer pointing to the session.

**Where:** new route in `src/services/worker/http/routes/`; installer hook template alongside existing hook installers.

**Verification:** make a temp repo, run capture + commit, assert `commit_sha` populated. Guard: idempotent (only fills NULL).

### Phase A5 — Query surface: `get_code_provenance` MCP tool + staleness

**What to implement (the "why was this written" query):**
New MCP tool in `src/servers/mcp-server.ts`:
`get_code_provenance({file, line, include_prompt}) → {changes:[{session_id, occurred_at, prompt_text, symbol, line_start, line_end, commit_sha, stale}]}`.
Resolution: tree-sitter parse current file → if `line` falls in a known symbol, query by `symbol_qualified_name`; else line-range overlap. Staleness: re-hash current symbol signature; `stale=true` if `≠ signature_hash`.

**Where:** tool registration near existing tools `src/servers/mcp-server.ts:460-887`; join `code_provenance → user_prompts → observations`.

**Verification:** query a known line → returns originating prompt; edit the symbol → same query returns `stale:true`. Add `tests/provenance/query.test.ts`.

---

## TRACK B — Team Multi-Session / Multi-Modal Memory

### Phase B1 — Four-part identity + visibility on every observation

**What to implement:** add `agent_tool_id` (enum), `visibility` (`private|team|org`), and ensure `org_id/team_id/actor_id` present on observations in **both** SQLite and Postgres. Index `(team_id, actor_id, visibility)`. Inject `agent_tool_id` from the platform adapter (`src/shared/platform-source.ts` already normalizes) and from the per-tool API key (B1.2).

**Where:** `src/services/sqlite/schema.sql`, `src/storage/postgres/schema.ts`, write paths `store.ts`. Per-agent-tool API keys via better-auth `src/server/auth/auth.ts`.

**Verification:** observation written from Cursor adapter carries `agent_tool_id='cursor'`; query layer test in B1.3.

**Why this is first:** unblocks B2–B5 (research consensus: four-part identity is the prerequisite primitive — Mem0/SAMEP/Collaborative-Memory).

### Phase B1.3 — Namespace enforcement at query layer

Filter every observation/provenance query: `team_id = requester.team_id AND (visibility IN ('team','org') OR actor_id = requester.actor_id)`. This is the privacy gate (read-time policy projection — simpler than DP, zero quality loss for authorized queries). **Where:** MCP search handler + worker `/api/search`. **Verify:** dev A cannot retrieve dev B's `private` observation; can retrieve `team` ones.

### Phase B2 — Private→team promotion workflow

**What to implement:** `POST /observations/:id/promote` (private→team|org, logs promoter+timestamp, optional re-embed with team-context prefix). Auto-promotion **suggestion** BullMQ job triggered post-push: for `private` observations linked (via `code_provenance`) to pushed files, flag for review if the symbol still exists; mark `stale` if deleted. **Where:** worker route + `src/server/jobs/`. **Verify:** promote flips visibility + audit row; deleted-symbol case marks stale.

### Phase B3 — Conflict, dedup, staleness (async BullMQ — never on write path)

**What to implement:**
- **Dedup at ingest (async):** query Chroma/pgvector top-3 same-entity observations; if cosine > 0.85 flag `possible_duplicate` (don't auto-suppress).
- **Contradiction linking:** add `contradicts_observation_id` FK + `confidence_score`; LLM-detected in async job; retrieval prefers higher-confidence/recent, surfaces link. **Never auto-resolve.**
- **Staleness:** `stale`, `stale_reason`, `last_valid_commit` columns; git-push job marks stale when linked tree-sitter entity changed/deleted (AST diff).
- **Consolidation ("dreaming"):** weekly per-team job clusters by entity+similarity, merges exact dups, summarizes >5-observation clusters into a `consolidated` parent.

**Where:** `src/server/jobs/` BullMQ workers; triggered by git webhook/CI step. **Verify:** contradictory observations get linked, not deleted; stale marking excludes from default retrieval (`?include_stale=true` to see).

### Phase B4 — Multi-modal capture (MAU pattern)

**What to implement (copy OmniMem MAU two-tier design):**
- Columns: `modality` (`text|screenshot|diagram|voice_transcript|code`), `content_pointer` (S3/local path for binary), `content_summary` (VLM/STT-generated text). **Embedding is always a text embedding of `content_summary`** → cross-modal retrieval stays modality-agnostic.
- Ingest pipeline `memory_add_screenshot(path, note)`: CLIP-dedup (discard >0.9 similar in session) → Claude VLM 2-3 sentence summary → store raw file + observation. Voice: VAD+STT → text observation.
- Progressive retrieval: L1 summary text only; L2 full observation; L3 raw binary only on `fetch_binary=true`.

**Where:** schema extension; new MCP tool; reuse Chroma sync (`ChromaSync.ts`) for the summary embedding. **Verify:** screenshot ingest stores pointer + summary; search returns summary at L1, binary only at L3. **Cost guard:** budget VLM-at-ingest before enabling team-wide (known gap: 50 devs × 10 shots/session).

### Phase B5 — Team-scoped retrieval ranking + pgvector in server-beta

**What to implement:**
- **pgvector:** populate the existing-but-unused `observations.embedding` (`schema.ts`) — switch column to `vector`, add HNSW index; embed via the same `all-MiniLM-L6-v2` or a server-side embedder. Closes the server-beta semantic-search gap (parity-map lists corpus/Chroma as unsupported in server-beta).
- **Scope-weighted ranking:** own ×1.5, team ×1.0, org ×0.7 (tunable per-user). **Relevance gate:** team/org observations injected only if similarity ≥ 0.70; personal ≥ 0.50 (Sourcegraph permalayer + Mem0 multi-signal).
- **Multi-signal fusion:** semantic + keyword (existing GIN tsvector) + **entity-exact** (tree-sitter entity id) — entity-match always ranks first.
- Port semantic context injection to server-beta (`/v1/context/semantic`), closing the `session-init.ts:73` TODO.

**Where:** `src/storage/postgres/observations.ts`, retrieval in `SearchOrchestrator`/`ChromaSearchStrategy`, server-beta context route. **Verify:** dev querying `handlePayment()` gets `handlePayment` observations ranked above semantically-near-but-different entities; private excluded; cross-dev noise gated out.

---

## Final Phase — Verification & Anti-Pattern Sweep

1. **Provenance correctness:** end-to-end — prompt → multi-edit → commit → `get_code_provenance(file,line)` returns the originating prompt text + commit; edit the symbol → `stale:true`.
2. **Privacy:** automated test matrix proving namespace enforcement (B1.3) across all visibility/scope combinations; no cross-team leak.
3. **Multi-tool:** capture the same edit from Claude Code AND Cursor adapters → both produce correct `agent_tool_id` + provenance rows.
4. **No write-path regressions:** confirm conflict/dedup runs in BullMQ, not inline (grep ingest path for synchronous LLM calls — should be none).
5. **Anti-pattern grep:** no raw-line-only anchors as primary; no `tool_use_id` assumptions; `AgentEvent` generic path intact (Claude Code is one adapter, not the core model).
6. **Build & types:** `npm run build-and-sync`, `npm run typecheck`, `bun test` (esp. `tests/provenance/`, `tests/server/`). Verify worker restarts and migrations apply on a fresh DB.
7. **Server-beta parity:** update `docs/server-beta-parity-map.md` — semantic search now supported via pgvector.

---

## Execution order & dependencies

```
A1 ─▶ A2 ─▶ A3 ─▶ A4 ─▶ A5        (provenance track; A3 needs B1 columns if running server-beta)
B1 ─▶ B1.3 ─▶ B2                  (identity is the unblock-everything root)
            └▶ B3
            └▶ B4
            └▶ B5
```
Recommended: **B1 + A1/A2 first** (identity primitive + line-range capture in parallel), then A3 (which unifies them), then fan out B2–B5. Each phase is independently shippable and testable.

## Known gaps to revisit (from research, medium confidence)
- Symbol-anchor renames break the name link (v1 accepts; full recovery needs git-history traversal).
- Scope weights (1.5/1.0/0.7) and thresholds (0.70/0.85) need empirical per-team tuning.
- `sqlite-sync` CRDT for local↔Postgres is promising but young — evaluate before relying on it.
- Content-level contradiction resolution is unsolved industry-wide — stay with link+flag.
- VLM-at-ingest cost at team scale unbudgeted — gate B4 behind a cost check.
