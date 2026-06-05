# Pathfinder — Handoff Prompts
**Feed each block to `/do` (or a fresh context) to execute that phase.**

---

## UI-1: Data layer (run first — all others depend on this)

```
Implement Phase UI-1 from plans/01-ui-multi-model-teams-commits-provenance.md.

Files to change:
- src/ui/viewer/types.ts:1 — add generated_by_model/agent_type/agent_id/visibility to Observation
- src/ui/viewer/types.ts:68 — add CLAUDE_MEM_SERVER_BETA_URL/API_KEY to Settings; add ModelStats/CommitRecord/ProvenanceEntry types
- src/ui/viewer/constants/api.ts — add MODELS_STATS, PROVENANCE_COMMITS, PROVENANCE_BY_LINE
- src/services/worker/http/routes/DataRoutes.ts:90 — add GET /api/models/stats handler
- src/services/worker/http/routes/ProvenanceRoutes.ts:21 — add GET /api/provenance/commits and GET /api/provenance/by-commit?sha= handlers
- Find the observation SELECT in DataRoutes.ts handleGetObservations + SSE broadcaster; add generated_by_model, agent_type, agent_id, visibility to SELECT

Anti-patterns: no new SQLite migrations (read-only queries on existing tables). No mock DB in tests.

Verify: bun test tests/provenance/ tests/sqlite/ tests/session_store.test.ts; start worker at :37778; curl /api/models/stats and /api/provenance/commits return valid JSON.
```

---

## UI-2: Multi-model badges + filter (after UI-1)

```
Implement Phase UI-2 from plans/01-ui-multi-model-teams-commits-provenance.md.

Files to change:
- src/ui/viewer/components/ObservationCard.tsx:28 — add model badge + agent_type badge
- src/ui/viewer/components/Header.tsx:7 — add currentModelFilter/onModelFilterChange/availableModels to HeaderProps; add model <select>
- src/ui/viewer/hooks/usePagination.ts:15 — add modelFilter param; append &model= to fetch URL
- src/ui/viewer/hooks/usePagination.ts:85 — thread modelFilter through usePagination
- src/ui/viewer/App.tsx:14 — add modelFilter state; derive availableModels from observations
- src/services/worker/http/routes/DataRoutes.ts:294 parsePaginationParams — add model param; add WHERE generated_by_model = ? to SQL

Anti-pattern: do not add routing library. Copy existing project <select> pattern in Header exactly.

Verify: build passes; npm run build; model badge visible on observations that have generated_by_model set.
```

---

## UI-3: Models panel (after UI-2)

```
Implement Phase UI-3 from plans/01-ui-multi-model-teams-commits-provenance.md.

New files:
- src/ui/viewer/hooks/useModels.ts
- src/ui/viewer/components/ModelsPanel.tsx

Modify:
- src/ui/viewer/App.tsx:14 — add modelsPanelOpen state; render <ModelsPanel>
- src/ui/viewer/components/Header.tsx:7 — add onModelsPanelToggle to HeaderProps; "Models" button

Import formatDate from '../utils/formatters'. No new backend work (uses /api/models/stats from UI-1).

Verify: "Models" button opens panel; table shows model/provider/count/last-seen; refresh re-fetches; tsc --noEmit clean.
```

---

## UI-4: Commits panel (after UI-1)

```
Implement Phase UI-4 from plans/01-ui-multi-model-teams-commits-provenance.md.

New files:
- src/ui/viewer/hooks/useCommits.ts
- src/ui/viewer/components/CommitsPanel.tsx

Modify:
- src/ui/viewer/App.tsx:14 — add commitsPanelOpen state
- src/ui/viewer/components/Header.tsx:7 — add "Commits" button + prop

IMPORTANT: GROUP_CONCAT is SQLite syntax (not array_agg). Use GROUP_CONCAT(DISTINCT file_path) in the SQL.
The /api/provenance/commits and /api/provenance/by-commit routes are added in UI-1.

Add L3 integration test: tests/integration/live-commits.test.ts — POST observation with editChanges + commit link, then GET /api/provenance/commits.

Verify: bun test tests/integration/ --timeout 30000; CommitsPanel renders and expands rows.
```

---

## UI-5: Provenance drawer (after UI-1)

```
Implement Phase UI-5 from plans/01-ui-multi-model-teams-commits-provenance.md.

New files:
- src/ui/viewer/hooks/useProvenance.ts
- src/ui/viewer/components/ProvenanceDrawer.tsx — copy slide-in pattern from LogsModal.tsx:70

Modify:
- src/ui/viewer/components/ObservationCard.tsx:28 — parse files_modified into clickable chips; add onFileClick? prop
- src/ui/viewer/components/Feed.tsx:9 — add onFileClick? prop, pass through to ObservationCard
- src/ui/viewer/App.tsx:14 — add provenanceTarget state; wire onFileClick; render <ProvenanceDrawer>

CRITICAL anti-pattern: commit SHA is plain text only — do NOT construct GitHub/external URLs.
CRITICAL anti-pattern: do NOT read files on the client side.

files_modified format may be paths only (no :line suffix) — handle both: "path/file.ts" and "path/file.ts:42".

Verify: clicking a file chip opens drawer; drawer shows prompt_text, agent_type, symbol_name; close button works; tsc --noEmit clean.
```

---

## UI-6: Teams panel (after UI-1; requires backend routes added first)

```
Implement Phase UI-6 from plans/01-ui-multi-model-teams-commits-provenance.md.

PREREQUISITE: Add 5 missing backend routes to src/server/routes/v1/ServerV1PostgresRoutes.ts first:
  GET /v1/teams, GET /v1/teams/:id, GET /v1/teams/:teamId/members, GET /v1/api-keys, POST /v1/api-keys
  Use this.asyncHandler + this.requireTeamId pattern (ServerV1PostgresRoutes.ts:1448).
  Use PostgresTeamsRepository + PostgresAuthRepository (injected at constructor line 102).

New files:
- src/ui/viewer/hooks/useTeams.ts
- src/ui/viewer/components/TeamsPanel.tsx

Modify:
- src/ui/viewer/utils/api.ts — add serverBetaFetch(path, settings) helper with Bearer auth header
- src/ui/viewer/App.tsx:14 — add teamsPanelOpen state; render <TeamsPanel>
- src/ui/viewer/components/Header.tsx:7 — "Team" button shown ONLY when settings.CLAUDE_MEM_SERVER_BETA_URL set

TeamsPanel must show error state (not crash) when server-beta URL is wrong or unreachable.

Verify: Team button hidden without CLAUDE_MEM_SERVER_BETA_URL; panel renders with server-beta running; revoked keys show badge; tsc --noEmit clean.
```
