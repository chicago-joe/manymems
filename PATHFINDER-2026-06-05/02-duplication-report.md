# Pathfinder — Duplication Report

## Cross-cutting concerns identified

### 1. Slide-in drawer pattern (legitimate reuse opportunity)
**Locations:**
- `LogsModal.tsx:70` — full slide-in drawer with drag-resize, close, scroll
- `ProvenanceDrawer.tsx` (new, UI-5) — same pattern needed
- `CommitsPanel.tsx` (new, UI-4) — same pattern needed
- `ModelsPanel.tsx` (new, UI-3) — same pattern needed
- `TeamsPanel.tsx` (new, UI-6) — same pattern needed

**Verdict:** Copy from `LogsModal.tsx:70`, do NOT abstract into a shared `<Drawer>` component yet — wait until ≥3 implementations exist and share CSS. Premature abstraction here would add a new component boundary with no current benefit.

### 2. `authFetch` + per-base-URL fetch (UI-6 adds second fetch target)
**Locations:**
- `viewer/utils/api.ts` — `authFetch` for local worker `/api/*`
- `viewer/hooks/useTeams.ts` (new) — `serverBetaFetch` for `/v1/*` with Bearer token

**Verdict:** Keep separate. They target different hosts, different auth schemes (none vs Bearer). Merging into one function adds a routing flag — worse than two named functions.

### 3. Panel open/close state management (App.tsx accumulates booleans)
**Current:** `contextPreviewOpen`, `logsModalOpen` (2 booleans)  
**After plan:** +4 more (`modelsPanelOpen`, `commitsPanelOpen`, `provenanceTarget`, `teamsPanelOpen`)

**Verdict:** Do NOT refactor to a router or panel-registry during this plan. After UI-6, consider a `usePanel` hook that returns `{open, toggle, close}` — but only after all 6 phases ship.

### 4. Pagination hook has model filter gap (within-feature duplication)
**Location:** `usePagination.ts:15` — `usePaginationFor` builds URL from `currentFilter` only.  
**Gap:** observations, summaries, and prompts each use `usePaginationFor` but the new `modelFilter` only applies to observations.  
**Verdict:** For UI-2, only add `?model=` to the observations call. Summaries and prompts don't have `generated_by_model`. This is NOT duplication — it's correct specialization.
