# Pathfinder — Feature Inventory
**Date:** 2026-06-05  
**Scope:** manymems UI — multi-model, models panel, teams, commits, provenance

---

## Existing UI Architecture (verified by smart_search 2026-06-05)

**Entry point:** `src/ui/viewer/App.tsx:15`  
**Framework:** React 18, TSX, no routing library — all views are conditional renders / modals  
**State management:** useState + custom hooks, no Redux  
**API layer:** `authFetch` via `src/ui/viewer/utils/api.ts`; endpoints in `src/ui/viewer/constants/api.ts`  
**Build:** bundled by the worker, served from same port

### Current Components
| File | Purpose |
|------|---------|
| `viewer/App.tsx:15` | Root — manages modal state, SSE feed, pagination |
| `viewer/components/Header.tsx:20` | Top bar — project filter, theme, help, context-preview button |
| `viewer/components/Feed.tsx:18` | Infinite-scroll feed of observations/summaries/prompts |
| `viewer/components/ObservationCard.tsx:28` | Card per observation — title, narrative, files_modified |
| `viewer/components/SummaryCard.tsx:9` | Card per summary |
| `viewer/components/PromptCard.tsx:9` | Card per user prompt |
| `viewer/components/ContextSettingsModal.tsx:120` | Settings form (provider, model, context config) |
| `viewer/components/LogsModal.tsx:70` | Slide-in logs drawer — **pattern to copy for new drawers** |
| `viewer/components/TerminalPreview.tsx:19` | ANSI terminal renderer — **reuse for provenance display** |

### Current API Endpoints (worker)
| Endpoint | Purpose |
|----------|---------|
| `GET /api/observations` | Paginated feed |
| `GET /api/summaries` | Paginated summaries |
| `GET /api/prompts` | Paginated user prompts |
| `GET /api/stats` | Worker stats |
| `GET /api/projects` | Project list |
| `GET /api/provenance/by-line?file=&line=` | ProvenanceRecord[] for file:line |
| `POST /api/provenance/link-commit` | A4 post-commit hook → backfill commit_sha |

### Current Data Types
- `Observation` (`types.ts:1`) — missing `generated_by_model`, `agent_type`, `agent_id`, `visibility`
- `Settings` (`types.ts:68`) — has provider fields; missing server-beta URL/key

### DB Columns Available But Not Exposed in UI
- `observations.generated_by_model` — which LLM processed the observation (migration 26)
- `observations.agent_type` / `agent_id` — which coding agent (migration B1, col `agent_type`)
- `observations.visibility` — public/team/private (migration B1.3)
- `code_provenance.*` — full intent→code table (migration 36)

---

## Feature Boundaries

### F1 — Multi-model badges (add to feed)
**Entry:** `viewer/components/ObservationCard.tsx:28`  
**Data path:** `Observation.generated_by_model` (already in DB, not in API response/type)  
**Gap:** `Observation` type missing field; API response not including it; no badge rendered  
**Scope:** extend type + response + add badge chip + model filter in Header

### F2 — Models panel (new view)
**Entry:** new `viewer/components/ModelsPanel.tsx`  
**Data path:** new `GET /api/models/stats` → `DataRoutes.ts:90`  
**Scope:** stats table by (model, provider), observation counts, last-seen; toggle from Header

### F3 — Teams panel (server-beta only)
**Entry:** new `viewer/components/TeamsPanel.tsx`  
**Data path:** `GET /v1/teams/*` on server-beta, requires API key from Settings  
**Scope:** members table, projects list, API key CRUD; only shown if server-beta configured  
**Backend gap:** need to verify which /v1/ GET routes exist in `ServerV1PostgresRoutes.ts:133`

### F4 — Commits view (new view)
**Entry:** new `viewer/components/CommitsPanel.tsx`  
**Data path:** new `GET /api/provenance/commits` → `ProvenanceRoutes.ts:21`  
**Scope:** commits table (sha, date, edit count, files); expandable rows showing file:line + symbol  
**No new migration needed** — queries existing `code_provenance` table

### F5 — Provenance drawer (per file:line)
**Entry:** clickable file chips in `viewer/components/ObservationCard.tsx:28`  
**Data path:** existing `GET /api/provenance/by-line?file=&line=`  
**Scope:** slide-in drawer (copy `LogsModal.tsx:70` pattern); shows prompt text, agent, commit_sha, symbol  
**Wiring:** `App.tsx` adds `provenanceTarget` state; Feed/ObservationCard accept `onFileClick` prop
