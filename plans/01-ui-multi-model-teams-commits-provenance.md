# manymems — UI Plan: Multi-model, Models, Teams, Commits, Provenance
**Phase refs:** UI-1 through UI-6  
**All citations verified by smart_search 2026-06-05**

---

## Phase 0 — Findings (DO NOT IMPLEMENT — reference only)

### Architecture facts

**React SPA entry:** `src/ui/viewer/App.tsx:15` — no routing, all views are `useState` booleans + conditional renders  
**Drawer pattern to copy:** `LogsModal.tsx:70-454` — slide-in drawer with drag-resize and close button  
**ANSI renderer to reuse:** `TerminalPreview.tsx:19` — handles loading state + DOMPurify  
**Auth fetch:** `viewer/utils/api.ts` — `authFetch(url, options?)` used by all hooks  
**API constants:** `viewer/constants/api.ts` — add new endpoints here, not inline  
**Model config already in Settings type:** `types.ts:68` — `CLAUDE_MEM_PROVIDER`, `CLAUDE_MEM_GEMINI_MODEL`, `CLAUDE_MEM_OPENROUTER_MODEL`

### DB columns available but not in API/UI
- `observations.generated_by_model` — added migration 26 (`SessionStore.ts:928`)  
- `observations.agent_type`, `agent_id` — added migration B1 (`SessionStore.ts:967`)  
- `observations.visibility` — added migration B1.3 (`SessionStore.ts:127`)  
- `code_provenance` table — full intent→code linkage (migration 36, `SessionStore.ts:88`)  
  - Cols: `id, file_path, line_start, line_end, commit_sha, user_prompt_id, memory_session_id, agent_type, agent_id, team_id, visibility, created_at_epoch, symbol_name, symbol_kind, symbol_signature`

### Existing API endpoints
```
GET  /api/observations          DataRoutes.ts:91
GET  /api/summaries             DataRoutes.ts:92
GET  /api/prompts               DataRoutes.ts:93
GET  /api/stats                 DataRoutes.ts:103
GET  /api/projects              DataRoutes.ts:104
GET  /api/provenance/by-line    ProvenanceRoutes.ts:22
POST /api/provenance/link-commit ProvenanceRoutes.ts:21
```

### Anti-patterns (DO NOT DO)
- Do not add a routing library (react-router) — use conditional renders like the existing codebase
- Do not mock the SQLite layer in L2 tests — hit real `:memory:` DB
- Do not construct GitHub/external URLs — display commit SHA as plain text only
- Do not add new SQLite migrations for read-only UI queries — query existing tables
- Do not block the observation write path — all new queries are read-only GET endpoints

---

## Phase UI-1 — Data layer: extend types + new backend endpoints

**Goal:** Add the three missing backend endpoints and extend the `Observation` type so subsequent phases have data to render.

### 1.1 Extend `Observation` type
**File:** `src/ui/viewer/types.ts:1`  
Add fields to `Observation` interface:
```ts
generated_by_model: string | null;
agent_type: string | null;
agent_id: string | null;
visibility: string | null;   // 'public' | 'team' | 'private' | null
```

**File:** `src/ui/viewer/types.ts:68`  
Add to `Settings` interface:
```ts
CLAUDE_MEM_SERVER_BETA_URL?: string;
CLAUDE_MEM_SERVER_BETA_API_KEY?: string;
```

Add new types:
```ts
export interface ModelStats {
  generated_by_model: string | null;
  platform_source: string;
  count: number;
  last_seen_epoch: number;
}

export interface CommitRecord {
  commit_sha: string;
  edit_count: number;
  earliest_epoch: number;
  files: string[];          // array of distinct file_path values
  entries: ProvenanceEntry[];  // populated on expand
}

export interface ProvenanceEntry {
  id: string;
  file_path: string;
  line_start: number;
  line_end: number;
  symbol_name: string | null;
  symbol_kind: string | null;
  commit_sha: string | null;
  prompt_text: string | null;
  agent_type: string | null;
  created_at_epoch: number;
}
```

### 1.2 Add API endpoint constants
**File:** `src/ui/viewer/constants/api.ts`  
Add to `API_ENDPOINTS`:
```ts
MODELS_STATS: '/api/models/stats',
PROVENANCE_COMMITS: '/api/provenance/commits',
PROVENANCE_BY_LINE: '/api/provenance/by-line',
```

### 1.3 Backend: `GET /api/models/stats`
**File:** `src/services/worker/http/routes/DataRoutes.ts:90`  
Register in `setupRoutes`: `app.get('/api/models/stats', this.handleGetModelStats.bind(this));`

Add handler method:
```ts
private handleGetModelStats(req: Request, res: Response): void {
  const rows = this.dbManager.getStore().db.query(`
    SELECT generated_by_model, platform_source,
           COUNT(*) AS count,
           MAX(created_at_epoch) AS last_seen_epoch
    FROM observations
    GROUP BY generated_by_model, platform_source
    ORDER BY count DESC
  `).all();
  res.json({ models: rows });
}
```
Note: `dbManager.getStore()` returns `SessionStore`; access `.db` for raw SQLite. Check `DatabaseManager.ts` to confirm the exact accessor name.

### 1.4 Backend: `GET /api/provenance/commits`
**File:** `src/services/worker/http/routes/ProvenanceRoutes.ts:20`  
Add route in `setupRoutes`: `app.get('/api/provenance/commits', this.handleCommits.bind(this));`

Add handler:
```ts
private handleCommits(req: Request, res: Response): void {
  const store = this.dbManager.getStore();
  const rows = store.db.query(`
    SELECT commit_sha,
           COUNT(*) AS edit_count,
           MIN(created_at_epoch) AS earliest_epoch,
           GROUP_CONCAT(DISTINCT file_path) AS files_concat
    FROM code_provenance
    WHERE commit_sha IS NOT NULL AND commit_sha != ''
    GROUP BY commit_sha
    ORDER BY earliest_epoch DESC
    LIMIT 100
  `).all() as any[];
  const commits = rows.map(r => ({
    commit_sha: r.commit_sha,
    edit_count: r.edit_count,
    earliest_epoch: r.earliest_epoch,
    files: (r.files_concat as string).split(',').filter(Boolean),
  }));
  res.json({ commits });
}
```

### 1.5 Extend observation API response to include new columns
**File:** `src/services/worker/http/routes/DataRoutes.ts` — find `handleGetObservations` method and the SQL SELECT statement; add `generated_by_model, agent_type, agent_id, visibility` to the SELECT list.  
Also update SSE broadcaster if it has its own SELECT — search for `SELECT.*FROM observations` in `src/services/worker/`.

### Verification — Phase UI-1
- [ ] `bun test tests/provenance/ tests/sqlite/` — all pass (no regressions from SQL changes)
- [ ] Start test worker (`CLAUDE_MEM_DATA_DIR=/tmp/manymems-e2e-home bun plugin/scripts/worker-service.cjs --daemon`), `curl http://127.0.0.1:37778/api/models/stats` returns `{models:[...]}` (may be empty array if no data)
- [ ] `curl http://127.0.0.1:37778/api/provenance/commits` returns `{commits:[...]}` 
- [ ] `curl http://127.0.0.1:37778/api/observations` response includes `generated_by_model` field

---

## Phase UI-2 — Multi-model badges in ObservationCard + model filter

**Goal:** Show which LLM generated each observation; filter feed by model.

### 2.1 Model badge in ObservationCard
**File:** `src/ui/viewer/components/ObservationCard.tsx:28`  
After the existing `platform_source` display, add:
```tsx
{observation.generated_by_model && (
  <span className="model-badge">{observation.generated_by_model}</span>
)}
{observation.agent_type && (
  <span className="agent-badge">{observation.agent_type}</span>
)}
```
Use existing badge CSS patterns (look for className patterns in `ObservationCard.tsx` for `platform_source` chip rendering).

### 2.2 Model filter in Header
**File:** `src/ui/viewer/components/Header.tsx:20`  
`HeaderProps` interface (`Header.tsx:7`): add:
```ts
currentModelFilter: string;
onModelFilterChange: (model: string) => void;
availableModels: string[];
```
Add a `<select>` for model filter alongside the existing project filter — copy the project `<select>` pattern exactly.

### 2.3 usePagination model filter
**File:** `src/ui/viewer/hooks/usePagination.ts:15`  
`usePaginationFor` builds query string from `currentFilter` (project). Extend signature:
```ts
function usePaginationFor<...>(endpoint: string, dataType: DataType, currentFilter: string, modelFilter?: string)
```
Append `&model=${encodeURIComponent(modelFilter)}` to the fetch URL when `modelFilter` is non-empty.

**File:** `src/ui/viewer/hooks/usePagination.ts:85` — pass `modelFilter` through `usePagination`.

### 2.4 App.tsx wiring
**File:** `src/ui/viewer/App.tsx:14`  
Add state: `const [modelFilter, setModelFilter] = useState('');`  
Pass to `<Header>`: `currentModelFilter={modelFilter} onModelFilterChange={setModelFilter} availableModels={[...]}` — derive `availableModels` from `observations.map(o => o.generated_by_model).filter(Boolean)` deduplicated.  
Pass `modelFilter` to `usePagination`.

### 2.5 Backend: add `?model=` param to observation queries
**File:** `src/services/worker/http/routes/DataRoutes.ts:294` — `parsePaginationParams` already extracts `project` and `platformSource`. Add `model: req.query.model as string | undefined`.  
Pass to SQL `WHERE generated_by_model = ?` (when provided).

### Verification — Phase UI-2
- [ ] Build passes: `npm run build`
- [ ] ObservationCard renders model badge when `generated_by_model` is populated
- [ ] Model filter dropdown in Header shows distinct models from current observations
- [ ] Selecting model filter reloads paginated observations with `?model=` param
- [ ] `bun test tests/provenance/ tests/sqlite/ tests/session_store.test.ts` — all pass

---

## Phase UI-3 — Models panel

**Goal:** Dedicated panel showing model usage stats (counts, last seen, provider breakdown).

### 3.1 useModels hook
**File:** `src/ui/viewer/hooks/useModels.ts` (new)  
```ts
export function useModels() {
  const [models, setModels] = useState<ModelStats[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  
  const refresh = useCallback(async () => {
    setIsLoading(true);
    const res = await authFetch(API_ENDPOINTS.MODELS_STATS);
    const data = await res.json();
    setModels(data.models ?? []);
    setIsLoading(false);
  }, []);
  
  useEffect(() => { refresh(); }, []);
  return { models, isLoading, refresh };
}
```

### 3.2 ModelsPanel component
**File:** `src/ui/viewer/components/ModelsPanel.tsx` (new)  
```tsx
export function ModelsPanel({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { models, isLoading, refresh } = useModels();
  if (!isOpen) return null;
  return (
    <div className="models-panel panel-slide-in">
      <div className="panel-header">
        <h2>Models</h2>
        <button onClick={onClose}>✕</button>
        <button onClick={refresh}>↺</button>
      </div>
      {isLoading ? <div className="loading">Loading...</div> : (
        <table className="models-table">
          <thead><tr><th>Model</th><th>Provider</th><th>Observations</th><th>Last seen</th></tr></thead>
          <tbody>
            {models.map((m, i) => (
              <tr key={i}>
                <td>{m.generated_by_model ?? '(unknown)'}</td>
                <td>{m.platform_source}</td>
                <td>{m.count}</td>
                <td>{formatDate(m.last_seen_epoch)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
```
Import `formatDate` from `'../utils/formatters'`.

### 3.3 App.tsx + Header wiring
**File:** `src/ui/viewer/App.tsx:14`  
Add: `const [modelsPanelOpen, setModelsPanelOpen] = useState(false);`  
Render: `<ModelsPanel isOpen={modelsPanelOpen} onClose={() => setModelsPanelOpen(false)} />`

**File:** `src/ui/viewer/components/Header.tsx:7`  
Add `onModelsPanelToggle: () => void` to `HeaderProps`; add "Models" button in header bar.

### Verification — Phase UI-3
- [ ] "Models" button in header opens panel
- [ ] Panel renders table with model/provider/count/date columns
- [ ] Refresh button re-fetches data
- [ ] Build passes; no TypeScript errors (`tsc --noEmit`)

---

## Phase UI-4 — Commits panel

**Goal:** Browse code_provenance records grouped by commit — "git blame, but with intent".

### 4.1 useCommits hook
**File:** `src/ui/viewer/hooks/useCommits.ts` (new)  
```ts
export function useCommits() {
  const [commits, setCommits] = useState<CommitRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [expandedSha, setExpandedSha] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    const res = await authFetch(API_ENDPOINTS.PROVENANCE_COMMITS);
    const data = await res.json();
    setCommits(data.commits ?? []);
    setIsLoading(false);
  }, []);

  useEffect(() => { refresh(); }, []);
  return { commits, isLoading, refresh, expandedSha, setExpandedSha };
}
```

### 4.2 CommitsPanel component
**File:** `src/ui/viewer/components/CommitsPanel.tsx` (new)  
Panel structure:
- Header: "Commits" title + close + refresh
- Table: SHA (first 8 chars), date, edit count, files list (truncated)
- Clicking a row calls `setExpandedSha(sha)` — toggling expansion
- Expanded row shows: each file_path with line range + symbol_name badge

```tsx
export function CommitsPanel({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { commits, isLoading, refresh, expandedSha, setExpandedSha } = useCommits();
  if (!isOpen) return null;
  return (
    <div className="commits-panel panel-slide-in">
      <div className="panel-header">
        <h2>Commits</h2>
        <button onClick={onClose}>✕</button>
        <button onClick={refresh}>↺</button>
      </div>
      {isLoading ? <div className="loading">Loading...</div> : (
        <div className="commits-list">
          {commits.map(c => (
            <div key={c.commit_sha} className="commit-row">
              <div className="commit-summary" onClick={() => setExpandedSha(expandedSha === c.commit_sha ? null : c.commit_sha)}>
                <code className="commit-sha">{c.commit_sha.slice(0,8)}</code>
                <span className="commit-date">{formatDate(c.earliest_epoch)}</span>
                <span className="commit-edits">{c.edit_count} edits</span>
                <span className="commit-files">{c.files.slice(0,3).join(', ')}{c.files.length > 3 ? ` +${c.files.length-3}` : ''}</span>
              </div>
              {expandedSha === c.commit_sha && (
                <CommitDetail commitSha={c.commit_sha} files={c.files} />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

### 4.3 CommitDetail sub-component
**File:** same `CommitsPanel.tsx`  
```tsx
function CommitDetail({ commitSha, files }: { commitSha: string; files: string[] }) {
  const [entries, setEntries] = useState<ProvenanceEntry[]>([]);
  useEffect(() => {
    authFetch(`/api/provenance/by-commit?sha=${encodeURIComponent(commitSha)}`)
      .then(r => r.json())
      .then(d => setEntries(d.entries ?? []));
  }, [commitSha]);
  return (
    <div className="commit-detail">
      {entries.map(e => (
        <div key={e.id} className="provenance-entry">
          <code>{e.file_path}:{e.line_start}-{e.line_end}</code>
          {e.symbol_name && <span className="symbol-badge">{e.symbol_name}</span>}
          {e.prompt_text && <p className="prompt-text">{e.prompt_text.slice(0, 200)}</p>}
        </div>
      ))}
    </div>
  );
}
```

**Backend:** Add `GET /api/provenance/by-commit?sha=` to `ProvenanceRoutes.ts:21`:
```ts
app.get('/api/provenance/by-commit', this.handleByCommit.bind(this));
```
Handler queries: `SELECT cp.*, up.prompt_text FROM code_provenance cp LEFT JOIN user_prompts up ON cp.user_prompt_id = up.id WHERE cp.commit_sha = ?`

### 4.4 App.tsx + Header wiring
Add `commitsPanelOpen` state; "Commits" button in `Header`.

### Verification — Phase UI-4
- [ ] `GET /api/provenance/commits` returns `{commits:[]}` when table empty, non-empty when provenance rows exist
- [ ] `GET /api/provenance/by-commit?sha=<sha>` returns entries for that commit
- [ ] CommitsPanel renders table; row click expands detail with file:line + symbol
- [ ] `bun test tests/provenance/` — all pass (add L3 test for new endpoint)
- [ ] Build passes, no TS errors

---

## Phase UI-5 — Provenance drawer (file:line → intent)

**Goal:** Click any file in an ObservationCard → see the intent chain that wrote that line.

### 5.1 Parse files_modified into clickable chips
**File:** `src/ui/viewer/components/ObservationCard.tsx:28`  

Currently `files_modified` is displayed as raw string. Change to:
```tsx
function parseFileChips(raw: string | null): Array<{path: string; line?: number}> {
  if (!raw) return [];
  return raw.split(',').map(s => s.trim()).filter(Boolean).map(s => {
    const m = s.match(/^(.+):(\d+)$/);
    return m ? { path: m[1], line: parseInt(m[2], 10) } : { path: s };
  });
}
```
Render each chip as a `<button>` that calls `onFileClick?.({ file: chip.path, line: chip.line ?? 1 })`.

**Props change:** Add `onFileClick?: (target: {file: string; line: number}) => void` to `ObservationCardProps` (`ObservationCard.tsx:5`).

### 5.2 Thread onFileClick through Feed
**File:** `src/ui/viewer/components/Feed.tsx:9`  
Add `onFileClick?: (target: {file: string; line: number}) => void` to `FeedProps`.  
Pass to `<ObservationCard observation={obs} onFileClick={onFileClick} />`.

### 5.3 useProvenance hook
**File:** `src/ui/viewer/hooks/useProvenance.ts` (new)  
```ts
export function useProvenance() {
  const [target, setTarget] = useState<{file: string; line: number} | null>(null);
  const [entries, setEntries] = useState<ProvenanceEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!target) return;
    setIsLoading(true);
    authFetch(`${API_ENDPOINTS.PROVENANCE_BY_LINE}?file=${encodeURIComponent(target.file)}&line=${target.line}`)
      .then(r => r.json())
      .then(d => { setEntries(d.records ?? []); setIsLoading(false); });
  }, [target]);

  return { target, setTarget, entries, isLoading };
}
```

### 5.4 ProvenanceDrawer component
**File:** `src/ui/viewer/components/ProvenanceDrawer.tsx` (new)  
Copy slide-in structure from `LogsModal.tsx:70-454`:
- `isOpen`: boolean (target !== null)  
- `onClose`: sets target to null  
- Header: file path + line number  
- Body: for each entry:
  - Agent type badge + timestamp
  - Prompt text (first 300 chars, expandable)
  - Symbol badge if `symbol_name` set
  - Commit SHA (plain text, monospace) if `commit_sha` set
  - `visibility` chip
- Uses `TerminalPreview.tsx:19` `isLoading` prop for loading state

### 5.5 App.tsx wiring
```tsx
const { target: provenanceTarget, setTarget: setProvenanceTarget, entries: provenanceEntries, isLoading: provenanceLoading } = useProvenance();
```
Pass `onFileClick={setProvenanceTarget}` to `<Feed>`.  
Render `<ProvenanceDrawer isOpen={!!provenanceTarget} target={provenanceTarget} entries={provenanceEntries} isLoading={provenanceLoading} onClose={() => setProvenanceTarget(null)} />`.

### Verification — Phase UI-5
- [ ] ObservationCard: files_modified chips are clickable buttons
- [ ] Clicking chip opens ProvenanceDrawer with file:line in header
- [ ] Drawer shows prompt text, agent_type, commit_sha, symbol_name for each entry
- [ ] Drawer close button sets target to null, drawer hides
- [ ] L3 integration: POST observation with editChanges, then GET /api/provenance/by-line → returns entries
- [ ] Build + `tsc --noEmit` clean

---

## Phase UI-6 — Teams panel (server-beta mode only)

**Goal:** Browse team members, projects, and API keys when running in server-beta mode.

### 6.1 Extend Settings + authFetch for server-beta
**File:** `src/ui/viewer/types.ts:68`  
Already added in UI-1: `CLAUDE_MEM_SERVER_BETA_URL`, `CLAUDE_MEM_SERVER_BETA_API_KEY`.

**File:** `src/ui/viewer/utils/api.ts`  
Add helper:
```ts
export function serverBetaFetch(path: string, settings: Settings, options?: RequestInit): Promise<Response> {
  const base = settings.CLAUDE_MEM_SERVER_BETA_URL?.replace(/\/$/, '') ?? '';
  return fetch(`${base}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${settings.CLAUDE_MEM_SERVER_BETA_API_KEY ?? ''}`,
      ...(options?.headers ?? {}),
    },
  });
}
```

### 6.2 Missing backend routes — must be added BEFORE UI work

**Verified by sonnet subagent reading `ServerV1PostgresRoutes.ts:133`:** these routes do NOT exist yet.

| Status | Route | Add to |
|--------|-------|--------|
| ✅ exists | `GET /v1/projects` | `ServerV1Routes.ts:86` |
| ✅ exists | `GET /v1/teams/:teamId/jobs` | `ServerV1PostgresRoutes.ts:415` |
| ❌ missing | `GET /v1/teams` | `ServerV1PostgresRoutes.ts` |
| ❌ missing | `GET /v1/teams/:id` | `ServerV1PostgresRoutes.ts` |
| ❌ missing | `GET /v1/teams/:teamId/members` | `ServerV1PostgresRoutes.ts` |
| ❌ missing | `GET /v1/api-keys` | `ServerV1PostgresRoutes.ts` |
| ❌ missing | `POST /v1/api-keys` | `ServerV1PostgresRoutes.ts` |

Add each using `this.asyncHandler` + `this.requireTeamId` pattern (`ServerV1PostgresRoutes.ts:1448`). Query via `PostgresTeamsRepository` and `PostgresAuthRepository` (already injected at `ServerV1PostgresRoutes.ts:102`). Register in `setupRoutes` (`ServerV1PostgresRoutes.ts:133`).

### 6.3 useTeams hook
**File:** `src/ui/viewer/hooks/useTeams.ts` (new)  
```ts
export function useTeams(settings: Settings) {
  const [team, setTeam] = useState<{id: string; name: string} | null>(null);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [projects, setProjects] = useState<{id: string; name: string}[]>([]);
  const [apiKeys, setApiKeys] = useState<{id: string; name: string; created_at: string; revoked_at: string|null}[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const enabled = !!(settings.CLAUDE_MEM_SERVER_BETA_URL && settings.CLAUDE_MEM_SERVER_BETA_API_KEY);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    setIsLoading(true);
    // Fetch team, members, projects, api-keys in parallel
    const [teamRes, keysRes] = await Promise.all([
      serverBetaFetch('/v1/teams', settings),
      serverBetaFetch('/v1/api-keys', settings),
    ]);
    const teamData = await teamRes.json();
    const keysData = await keysRes.json();
    const t = teamData.teams?.[0] ?? null;
    setTeam(t);
    setApiKeys(keysData.api_keys ?? []);
    if (t) {
      const [membRes, projRes] = await Promise.all([
        serverBetaFetch(`/v1/teams/${t.id}/members`, settings),
        serverBetaFetch(`/v1/teams/${t.id}/projects`, settings),
      ]);
      setMembers((await membRes.json()).members ?? []);
      setProjects((await projRes.json()).projects ?? []);
    }
    setIsLoading(false);
  }, [enabled, settings]);

  useEffect(() => { refresh(); }, [enabled]);
  return { enabled, team, members, projects, apiKeys, isLoading, refresh };
}
```

### 6.4 TeamsPanel component
**File:** `src/ui/viewer/components/TeamsPanel.tsx` (new)  
Sections:
1. **Team** — name header
2. **Members** — table: actor_id, role, joined date  
3. **Projects** — list: name, id  
4. **API Keys** — table: name, created_at, revoked indicator (`revoked_at !== null`)

Only renders when `enabled === true`; otherwise shows "Configure server-beta URL and API key in Settings to enable Teams."

### 6.5 App.tsx + Header wiring
Add `teamsPanelOpen` state; `<Header>` gets `onTeamsPanelToggle` prop; "Team" button shows in Header only when `settings.CLAUDE_MEM_SERVER_BETA_URL` is set.

### Verification — Phase UI-6
- [ ] "Team" button hidden in header when `CLAUDE_MEM_SERVER_BETA_URL` not configured
- [ ] With server-beta running, TeamsPanel fetches and renders members/projects/keys
- [ ] API key revoked keys shown with strikethrough or "Revoked" badge
- [ ] No crash when server-beta URL is wrong (show error state)
- [ ] Build + `tsc --noEmit` clean

---

## Testing Contract (per manymems standard)

- **L1+L2** (`:memory:` round-trip) — mandatory every phase; `bun test tests/provenance/ tests/sqlite/ tests/session_store.test.ts tests/context/`
- **L3** (live worker at :37778) — mandatory for any new HTTP route; `bun test tests/integration/ --timeout 30000`
- **L4** (Docker e2e) — run after UI-4/UI-5 complete to verify provenance end-to-end

Start test worker:
```bash
mkdir -p /tmp/manymems-e2e-home
echo '{"CLAUDE_MEM_WORKER_PORT":"37778","CLAUDE_MEM_WORKER_HOST":"127.0.0.1","CLAUDE_MEM_CHROMA_ENABLED":"false","CLAUDE_MEM_LOG_LEVEL":"warn","CLAUDE_MEM_DATA_DIR":"/tmp/manymems-e2e-home"}' \
  > /tmp/manymems-e2e-home/settings.json
CLAUDE_MEM_DATA_DIR=/tmp/manymems-e2e-home bun plugin/scripts/worker-service.cjs --daemon
until curl -sf http://127.0.0.1:37778/api/health | grep -q '"initialized":true'; do sleep 1; done
```

---

## Execution Order

```
UI-1 (data layer)  →  UI-2 (badges)  →  UI-3 (models panel)
                   →  UI-4 (commits)
                   →  UI-5 (provenance drawer)
                   →  UI-6 (teams)
```

UI-1 must complete first (shared types + new backend routes).  
UI-2, UI-4, UI-5, UI-6 can run in parallel after UI-1.  
UI-3 depends on UI-2 (`ModelStats` type).
