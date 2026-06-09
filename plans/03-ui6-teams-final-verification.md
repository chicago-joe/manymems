# manymems — Plan 03: UI-6 Teams Panel + Final Verification

**Scope:** (A) UI-6 Teams panel — server-beta identity browsing; (B) master plan final verification sweep; (C) L4 Docker e2e extension for B5 pgvector.

All citations verified by parallel discovery agents on 2026-06-09.

---

## Phase 0 — Documentation Discovery (DONE)

### 0.1 Architecture facts (verified)

**What exists:**
- `CLAUDE_MEM_SERVER_BETA_URL` / `CLAUDE_MEM_SERVER_BETA_API_KEY` in `Settings` type — `src/ui/viewer/types.ts:99-100`
- `authFetch` bare-passthrough — `src/ui/viewer/utils/api.ts:1`
- `PostgresTeamsRepository` with `create`, `addMember`, `getByIdForUser`, `getMember` — `src/storage/postgres/teams.ts`
- `PostgresAuthRepository` with `createApiKey`, `getApiKeyByHash` — `src/storage/postgres/auth.ts`
- `teams`, `team_members`, `api_keys` DB tables — `src/storage/postgres/schema.ts:124,142,169`
- Pattern to copy: `ModelsPanel.tsx` + `useModels.ts` hook
- `POST /v1/context/semantic` endpoint — `src/storage/postgres/SemanticContextRoute.ts`

**What is missing:**
| Item | Status |
|---|---|
| `serverBetaFetch(path, settings, opts?)` | MISSING — needs `src/ui/viewer/utils/api.ts` |
| `TeamInfo`, `TeamMember`, `ApiKeyInfo` types | MISSING — needs `src/ui/viewer/types.ts` |
| `useTeams` hook | MISSING — needs `src/ui/viewer/hooks/useTeams.ts` |
| `TeamsPanel` component | MISSING — needs `src/ui/viewer/components/TeamsPanel.tsx` |
| App.tsx + Header wiring | MISSING |
| `GET /v1/teams` route | MISSING — no `ServerV1TeamsRoutes.ts` |
| `GET /v1/teams/:id` route | MISSING |
| `GET /v1/teams/:teamId/members` route | MISSING |
| `GET /v1/api-keys` route | MISSING |
| `PostgresTeamsRepository.listForUser(userId)` | MISSING |
| `PostgresTeamsRepository.listMembers(teamId)` | MISSING |
| pgvector test in `scripts/e2e-server-beta-docker.sh` | MISSING |

### 0.2 Allowed APIs (copy; do NOT invent)

- Hook pattern: copy `src/ui/viewer/hooks/useModels.ts` — `useCallback` → `authFetch(endpoint)` → `res.ok` check → `useEffect refresh`
- Panel pattern: copy `src/ui/viewer/components/ModelsPanel.tsx:1-39` — guard `if (!isOpen) return null`, `{ isLoading, error, refresh }` states
- Repository pattern: copy existing methods in `src/storage/postgres/teams.ts` for new `listForUser` / `listMembers`
- Route pattern: copy `src/services/worker/http/routes/ProvenanceRoutes.ts` handler structure
- CSS: write only into `src/ui/viewer-template.html` CSS block, never into component files

### 0.3 Anti-pattern guards

- **Do NOT** run `npm run build-and-sync` — use `npm run build` only (37777 = stock claude-mem, OFF LIMITS)
- **Do NOT** run parallel agents on `App.tsx` — one sequential edit only
- **Do NOT** add new migrations to only one chain — both `SessionStore.ts` constructor AND `migrations/runner.ts`
- **Do NOT** split `files_modified`/`files_read` on comma — they are JSON arrays, use `JSON.parse()`
- `serverBetaFetch` must use `Authorization: Bearer <key>` header (not `X-API-Key`)
- `TeamsPanel` only renders when `CLAUDE_MEM_SERVER_BETA_URL` is set in settings

---

## TRACK UI-6 — Teams Panel

### Phase UI6-B1 — Backend routes for team/member/key listing

**File to create:** `src/services/worker/http/routes/ServerV1TeamsRoutes.ts`

**Repository additions** (add to `src/storage/postgres/teams.ts`):
- `listForUser(client, userId): Promise<TeamRow[]>` — `SELECT t.* FROM teams t JOIN team_members tm ON t.id = tm.team_id WHERE tm.actor_id = $1`
- `listMembers(client, teamId): Promise<MemberRow[]>` — `SELECT tm.*, t.name AS team_name FROM team_members tm WHERE tm.team_id = $1 ORDER BY tm.joined_at DESC`

**Routes to implement** (copy handler pattern from `ProvenanceRoutes.ts`):
```
GET  /v1/teams                   → listForUser(actor_id from auth context)
GET  /v1/teams/:teamId           → getByIdForUser(teamId, actor_id)
GET  /v1/teams/:teamId/members   → listMembers(teamId)
GET  /v1/api-keys                → query api_keys WHERE team_id = auth.team_id AND revoked_at IS NULL
```

**Wire into server-beta startup:**
Find where server-beta routes are registered (grep for `ServerV1Routes` in `src/services/worker/`) and add `new ServerV1TeamsRoutes(db).setup(app)`.

**Verification — Phase UI6-B1:**
- `curl http://127.0.0.1:37778/v1/teams -H "Authorization: Bearer <key>" | jq .` returns array (run against isolated test worker at 37778 — NEVER 37777)
- Unit test: `tests/server/teams-routes.test.ts` — `:memory:` Postgres mock + 2 assertions (list returns array, unknown teamId returns 404)
- `bun tsc --noEmit` clean

---

### Phase UI6-F1 — Frontend utilities and types

**File to modify:** `src/ui/viewer/utils/api.ts`

Add `serverBetaFetch` (reading `CLAUDE_MEM_SERVER_BETA_URL` + `CLAUDE_MEM_SERVER_BETA_API_KEY` from settings):

```ts
export async function serverBetaFetch(
  path: string,
  settings: Settings,
  init?: RequestInit
): Promise<Response> {
  const base = settings.CLAUDE_MEM_SERVER_BETA_URL?.replace(/\/$/, '');
  const key  = settings.CLAUDE_MEM_SERVER_BETA_API_KEY;
  if (!base || !key) throw new Error('Server beta not configured');
  return fetch(`${base}${path}`, {
    ...init,
    headers: { 'Authorization': `Bearer ${key}`, ...(init?.headers ?? {}) },
  });
}
```

**File to modify:** `src/ui/viewer/types.ts`

Add interfaces (append after existing `CommitRecord`):
```ts
export interface TeamInfo {
  id: string;
  name: string;
  created_at: string;
}
export interface TeamMember {
  actor_id: string;
  role: string;
  joined_at: string;
}
export interface ApiKeyInfo {
  id: string;
  name: string;
  created_at: string;
  revoked_at: string | null;
}
```

**Verification — Phase UI6-F1:**
- `grep "serverBetaFetch" src/ui/viewer/utils/api.ts` — ≥1 result
- `grep "TeamInfo\|TeamMember\|ApiKeyInfo" src/ui/viewer/types.ts` — 3 results
- `bun tsc --noEmit` clean

---

### Phase UI6-F2 — `useTeams` hook

**File to create:** `src/ui/viewer/hooks/useTeams.ts`

Copy pattern from `src/ui/viewer/hooks/useModels.ts` exactly. Replace `authFetch(API_ENDPOINTS.MODELS_STATS)` with `serverBetaFetch('/v1/teams', settings)`. Return `{ teams, members, apiKeys, isLoading, error, refresh }`.

Three sub-fetches (called when `settings.CLAUDE_MEM_SERVER_BETA_URL` is set):
1. `serverBetaFetch('/v1/teams', settings)` → `TeamInfo[]`
2. If teams[0] exists: `serverBetaFetch('/v1/teams/${teams[0].id}/members', settings)` → `TeamMember[]`
3. `serverBetaFetch('/v1/api-keys', settings)` → `ApiKeyInfo[]`

Guard: if `!settings.CLAUDE_MEM_SERVER_BETA_URL`, return empty state immediately without fetching.

**Verification — Phase UI6-F2:**
- `ls src/ui/viewer/hooks/useTeams.ts` — exists
- `grep "serverBetaFetch" src/ui/viewer/hooks/useTeams.ts` — ≥1
- `bun tsc --noEmit` clean

---

### Phase UI6-F3 — `TeamsPanel` component

**File to create:** `src/ui/viewer/components/TeamsPanel.tsx`

Copy outer structure from `src/ui/viewer/components/ModelsPanel.tsx` (guard, loading/error states, close button).

Props: `{ isOpen: boolean; onClose: () => void; settings: Settings }`

Display (when `settings.CLAUDE_MEM_SERVER_BETA_URL` is set):
- **Team section:** name + id chip
- **Members table:** `actor_id` | role | `joined_at` (formatted)
- **API Keys table:** name | `created_at` | status (active/revoked badge)

Disabled state (when `CLAUDE_MEM_SERVER_BETA_URL` not set):
```
Server beta not configured.
Set CLAUDE_MEM_SERVER_BETA_URL and CLAUDE_MEM_SERVER_BETA_API_KEY to view team details.
```

**CSS additions** (append to `src/ui/viewer-template.html` `<style>` block):
```css
/* TeamsPanel */
.teams-panel { ... }  /* copy .models-panel pattern */
.teams-table { width: 100%; border-collapse: collapse; font-size: 12px; }
.teams-table th { color: var(--mm-text-muted); font-weight: normal; padding: 4px 8px; border-bottom: 1px solid var(--mm-border); text-align: left; }
.teams-table td { padding: 4px 8px; border-bottom: 1px solid var(--mm-border); color: var(--mm-text-secondary); }
.key-active  { color: var(--mm-accent-teal); font-size: 10px; }
.key-revoked { color: var(--mm-accent-red);  font-size: 10px; text-decoration: line-through; }
```

**Verification — Phase UI6-F3:**
- `ls src/ui/viewer/components/TeamsPanel.tsx` — exists
- `grep "useTeams\|TeamMember\|ApiKeyInfo" src/ui/viewer/components/TeamsPanel.tsx` — ≥3
- `grep "mm-accent-teal\|key-active" src/ui/viewer/components/TeamsPanel.tsx` — 0 (styles in template only)
- `grep "teams-table\|key-active" src/ui/viewer-template.html` — ≥2
- `bun tsc --noEmit` clean

---

### Phase UI6-F4 — Wire into App.tsx + Header (sequential, single pass)

**CRITICAL: One agent, one sequential edit to App.tsx. Never parallel.**

Read App.tsx first. Find: how `CommitsPanel` is imported/rendered, how `ModelsPanelToggle` state is managed, where panel state is declared, and how `settings` is threaded.

**App.tsx additions (one edit):**
1. Import `TeamsPanel` + `useTeams`
2. Add `const [teamsPanelOpen, setTeamsPanelOpen] = useState(false)` near other panel states
3. Call `useTeams` hook: `const { teams, members, apiKeys, isLoading: teamsLoading, error: teamsError } = useTeams(settings)`
4. Add `onTeamsPanelToggle={() => setTeamsPanelOpen(v => !v)}` to `<Header>` props
5. Add `<TeamsPanel isOpen={teamsPanelOpen} onClose={() => setTeamsPanelOpen(false)} settings={settings} />` near other panels

**Header.tsx additions:**
- Add `onTeamsPanelToggle: () => void` to `HeaderProps` interface
- Add `onTeamsPanelToggle` to destructured props
- Add "Teams" button (copy style from existing nav-panel-btn buttons); render only when `settings.CLAUDE_MEM_SERVER_BETA_URL` is set — pass `settings` prop to Header, or pass a `serverBetaEnabled: boolean` prop

**Verification — Phase UI6-F4:**
- `grep "TeamsPanel\|teamsPanelOpen" src/ui/viewer/App.tsx` — ≥3 results
- `grep "onTeamsPanelToggle" src/ui/viewer/components/Header.tsx` — ≥2 (interface + usage)
- `bun tsc --noEmit` clean
- L1/L2 tests: `bun test tests/provenance/ tests/sqlite/ tests/session_store.test.ts tests/context/` — all pass

---

## TRACK V — Master Plan Final Verification Sweep

### Phase V1 — Anti-pattern grep sweep

Run these greps and assert each returns 0 matches:

**1a. No synchronous LLM calls on ingest write path:**
```bash
grep -rn "await.*generate\|await.*createMessage\|await.*query(" \
  src/services/worker/http/shared.ts \
  src/services/worker/SessionManager.ts \
  src/services/worker/http/routes/SessionRoutes.ts
```
Expected: 0 matches (all LLM calls must go through BullMQ jobs, not inline)

**1b. No `tool_use_id` assumptions in provenance code:**
```bash
grep -rn "tool_use_id" src/services/provenance/ src/cli/
```
Expected: 0 matches

**1c. No raw-line-only anchors as primary provenance key:**
```bash
grep -rn "line_start.*PRIMARY\|PRIMARY.*line_start" src/services/sqlite/ src/storage/postgres/
```
Expected: 0 matches (symbol_qualified_name is the primary anchor; line_start is a snapshot)

**1d. AgentEvent generic path intact (Claude Code is one adapter, not the core model):**
```bash
grep -rn "claude-code.*core\|if.*claude.code.*then" src/cli/handlers/
```
Expected: 0 matches

**Verification — Phase V1:** All 4 greps return 0 matches → PASS.

---

### Phase V2 — Provenance end-to-end correctness

**What to verify (from master plan item 1):**
> prompt → multi-edit → commit → `get_code_provenance(file,line)` returns originating prompt + commit; edit symbol → `stale:true`

Run L3 integration test suite (requires isolated test worker at 37778):
```bash
# Start isolated worker
mkdir -p /tmp/manymems-e2e-home
echo '{"CLAUDE_MEM_WORKER_PORT":"37778","CLAUDE_MEM_WORKER_HOST":"127.0.0.1","CLAUDE_MEM_CHROMA_ENABLED":"false","CLAUDE_MEM_LOG_LEVEL":"warn","CLAUDE_MEM_DATA_DIR":"/tmp/manymems-e2e-home"}' \
  > /tmp/manymems-e2e-home/settings.json
export PATH="$PATH:/home/chicagojoe/.bun/bin"
CLAUDE_MEM_DATA_DIR=/tmp/manymems-e2e-home bun plugin/scripts/worker-service.cjs --daemon
until curl -sf http://127.0.0.1:37778/api/health | grep -q '"initialized":true'; do sleep 1; done
# Run L3
bun test tests/integration/ --timeout 30000
```
Expected: all L3 tests pass.

**Verification — Phase V2:** L3 pass count matches prior baseline (≥65 tests).

---

### Phase V3 — Privacy namespace enforcement (B1.3)

**What to verify (from master plan item 2):**
> dev A cannot retrieve dev B's `private` observation; can retrieve `team` ones

Run existing privacy tests if present:
```bash
bun test tests/provenance/ tests/sqlite/ --grep "visibility\|namespace\|private\|team" --timeout 30000
```

If no targeted test exists, grep to confirm the filter is in place:
```bash
grep -n "visibility.*private\|actor_id.*requester\|namespace" \
  src/services/sqlite/observations/ \
  src/services/worker/http/routes/SearchRoutes.ts \
  src/services/worker/http/routes/ObservationRoutes.ts 2>/dev/null | head -20
```
Expected: filter code is present in query handlers.

**Verification — Phase V3:** Test pass OR grep shows filter code in place.

---

### Phase V4 — Build + types + full test suite

```bash
export PATH="$PATH:/home/chicagojoe/.bun/bin"
bun tsc --noEmit                                          # F1: 0 errors
npm run build 2>&1 | tail -5                              # F2: no fatal errors
bun test tests/provenance/ tests/sqlite/ \
  tests/session_store.test.ts tests/context/ \
  --timeout 30000 2>&1 | tail -5                          # F5: all pass
grep -r "claude-mem" src/ui/viewer/ | \
  grep -v "\.webp\|\.png\|ObservationCard\|useTheme\|mcp__plugin_claude-mem" # F3: 0 results
```

**Verification — Phase V4:** All 4 commands pass.

---

### Phase V5 — L4 Docker e2e: extend for B5 pgvector

**File to modify:** `scripts/e2e-server-beta-docker.sh`

**First, verify Docker image has pgvector:**
```bash
grep -n "postgres\|pgvector\|ankane" docker-compose.yml docker-compose.e2e.yml
```
If image is `postgres:*` (not `ankane/pgvector`), update `docker-compose.e2e.yml` to use `ankane/pgvector:latest` — this is required for B5 to work at all.

**Add phase3 block** after the existing phase2 block in `scripts/e2e-server-beta-docker.sh`:

```bash
phase "phase3: pgvector semantic search"

# Verify pgvector extension is active in Postgres
PGVECTOR_ACTIVE=$(docker exec manymems-postgres-1 psql -U postgres -d claude_mem -t -c \
  "SELECT COUNT(*) FROM pg_extension WHERE extname='vector';" 2>/dev/null | tr -d ' ')
if [ "$PGVECTOR_ACTIVE" != "1" ]; then
  echo "SKIP: pgvector extension not available (non-pgvector Postgres image)"
else
  # Call migratePostgresForPgvector via the server's migration endpoint (if exposed)
  # OR verify POST /v1/context/semantic returns 200 or 501-with-reason (not 500)
  SEMANTIC_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
    -X POST http://127.0.0.1:37877/v1/context/semantic \
    -H "Authorization: Bearer $TEST_API_KEY" \
    -H "Content-Type: application/json" \
    -d '{"embedding":[],"teamId":"test","projectId":"test"}')
  # 400 = validation error (embedding wrong length) = endpoint exists and is reachable
  # 501 = pgvector not migrated yet = endpoint exists
  # 200 = fully working
  if [ "$SEMANTIC_STATUS" = "500" ] || [ "$SEMANTIC_STATUS" = "404" ]; then
    fail "POST /v1/context/semantic returned $SEMANTIC_STATUS — endpoint broken or not registered"
  fi
  echo "PASS: /v1/context/semantic reachable (HTTP $SEMANTIC_STATUS)"
fi
```

**Verification — Phase V5:**
- Run `bash scripts/e2e-server-beta-docker.sh` — all phases pass (phase3 either passes or prints SKIP with reason)
- No phase3 failure should be a silent exit 0 — verify the `fail` helper is called on unexpected status codes

---

### Phase V6 — Server-beta parity map update

**File to modify:** `docs/server-beta-parity-map.md`

Verify and update the parity map entries for:
1. `POST /v1/context/semantic` — mark ✅ Supported via pgvector (B5) (may already be done from last session)
2. Any UI-6 team routes added in this plan — add rows for `GET /v1/teams`, `GET /v1/teams/:id/members`, `GET /v1/api-keys`

**Verification — Phase V6:**
- `grep "semantic\|✅" docs/server-beta-parity-map.md` — ≥1 result for semantic search
- `bun tsc --noEmit` clean (no new type errors from doc edits)

---

## Execution order & dependencies

```
UI6-B1 (backend routes + repo methods)
  → UI6-F1 (types + serverBetaFetch)     [can run after B1 or in parallel with it]
    → UI6-F2 (useTeams hook)
      → UI6-F3 (TeamsPanel component)
        → UI6-F4 (App.tsx + Header wire — SEQUENTIAL, single agent)

V1 (anti-pattern greps)      [independent, run any time]
V2 (L3 provenance e2e)       [independent]
V3 (privacy enforcement)     [independent]
V4 (build + types + L1/L2)   [after UI6-F4 to catch new type errors]
V5 (L4 Docker e2e + pgvector) [independent — requires Docker]
V6 (parity map update)       [after V5]
```

Parallel-safe pairs (non-overlapping files):
- `UI6-B1 + V1 + V2 + V3` can all run simultaneously
- `UI6-F1 + UI6-F2` can be done by one agent (non-overlapping files)
- **Never:** >1 agent touching `App.tsx` or `Header.tsx` simultaneously

---

## Known gaps

- Docker image pgvector availability unknown until V5 runs — if `docker-compose.e2e.yml` uses plain `postgres:*`, update to `ankane/pgvector:latest` first
- `GET /v1/teams` will return the authenticated user's teams only — no admin "list all" is planned
- UI-6 has no L3 integration test yet; add `tests/integration/teams-routes.test.ts` in UI6-B1
- `TeamsPanel` only shows the first team's members — multi-team member browsing is out of scope for v1
