# Plan 13 — Prefect Cloud Dashboard + Entire.io Feature Integration

**Branch**: `feat/prefect-dashboard-entireio`
**Worktree**: `/home/chicagojoe/PyCharmProjects/manymems-dashboard`
**Goal**: Redesign the manymems UI into a Prefect Cloud-styled dashboard where CommitGraph is the main view, and integrate the entire.io CLI feature set (sessions, checkpoints, attribution, agents, rewind, worktrees, concurrent-session guards, and configuration) into the new layout.

---

## Phase 0: Documentation Discovery — DONE

### Allowed APIs (from 20 scraped deepwiki.com/entireio/cli pages)

**Entire.io Core Data Shapes:**

| Concept | Storage | Key Fields |
|---------|---------|------------|
| Session | `.git/entire-sessions/<id>.json` | `SessionID (YYYY-MM-DD-UUID)`, `BaseCommit`, `Phase (PhaseIdle/PhaseActive/PhaseEnded)`, `FilesTouched`, `PromptAttributions[]` |
| Temporary Checkpoint | Shadow branch `entire/<commit[:7]>-<worktree[:6]>` | Full worktree snapshot, `stepNumber`, `timestamp` |
| Committed Checkpoint | `entire/checkpoints/v1` at `a3/b2c4d5e6f7/` | `CheckpointID (12-hex)`, transcript, metadata, `Entire-Checkpoint: <id>` trailer |
| Attribution | Per commit `Entire-Attribution: 73% agent (146/200 lines)` | `AgentLines`, `HumanAdded`, `HumanModified`, `AgentPercentage` |
| RewindPoint | Aggregated from shadow + logs | `Type (shadow/logs-only/task)`, `sha`, `timestamp`, `transcript` |
| Agent | Normalized event emitter | `AgentName`, Event types: `SessionStart/TurnStart/TurnEnd/Compaction/SubagentStart/SubagentEnd` |
| Config | `.entire/settings.json` + `.entire/settings.local.json` | `Enabled`, `LogLevel`, `CommitLinking (always/prompt)`, `ExternalAgents`, `RedactionSettings` |
| Worktree | `.git/entire-sessions/` scoped | `WorktreeID` (empty=main, slug=linked), shadow branch suffix |

**Event types** (lifecycle events driving session state):
- `TurnStart` → PhaseIdle→PhaseActive
- `TurnEnd` → saves temporary checkpoint
- `GitCommit` → condenses shadow→committed
- `Compaction` → triggers condensation
- `SubagentStart/SubagentEnd` → task checkpoint on shadow branch
- `SessionEnd` → PhaseActive→PhaseEnded

**Existing Manymems UI Facts:**
- `App.tsx:202` — boolean state panel system (no router)
- `CommitGraph.tsx:267` — SVG visual git tree with model-colored lanes, already working
- `CheckpointFeed.tsx` — commit card list (currently secondary overlay view)
- `CommitsPanel.tsx` — side panel wrapper around CommitGraph
- `ModelsPanel.tsx`, `TeamsPanel.tsx` — separate side panels
- CSS: CSS custom properties in `viewer-template.html`, dark/light theming
- Font: Monaspace Radon (variable), loaded from `/assets/fonts/`
- API: `/api/provenance/commits`, `/api/observations`, `/api/models/stats`, `/v1/teams`

**Anti-pattern guards:**
- Never use `find` in Bash — use Glob/Grep
- Never run `build-and-sync` — only `npm run build`
- Never touch port 37777 — dev is 37778
- Never run two agents on App.tsx simultaneously
- `observation.files_modified` is a JSON-encoded string — always `JSON.parse()`

---

## Phase 1: Branch + Worktree Setup

**Goal**: Create isolated workspace for this feature.

```bash
export PATH="$PATH:/home/chicagojoe/.bun/bin"
cd /home/chicagojoe/PyCharmProjects/manymems

# Create branch
git checkout -b feat/prefect-dashboard-entireio

# Create worktree
git worktree add ../manymems-dashboard feat/prefect-dashboard-entireio

# Verify
git worktree list
ls ../manymems-dashboard/
```

**Work from**: `/home/chicagojoe/PyCharmProjects/manymems-dashboard`

**Verification**:
- [ ] `git worktree list` shows both main and worktree
- [ ] `../manymems-dashboard/` directory exists with full source tree
- [ ] `git -C ../manymems-dashboard branch --show-current` returns `feat/prefect-dashboard-entireio`

---

## Phase 2: Prefect Cloud Theme + Font System

**Goal**: Replace current theme with Prefect Cloud visual language.

**Prefect Cloud design tokens** (from Prefect Cloud UI inspection):
- Background hierarchy: `#0a0e1a` (app bg) → `#0f1629` (surface) → `#1a2035` (card) → `#1f2840` (elevated card)
- Accent/brand: `#3b82f6` (blue-500, primary) · `#06b6d4` (cyan, data) · `#8b5cf6` (violet, sessions)
- Status: `#10b981` (emerald, success) · `#f59e0b` (amber, warning) · `#ef4444` (red, error)
- Text: `#f1f5f9` (primary) · `#94a3b8` (secondary) · `#475569` (muted/disabled)
- Border: `rgba(255,255,255,0.06)` (default) · `rgba(59,130,246,0.4)` (focus/active)
- Font: Inter (sans-serif) — replace Monaspace Radon for body text; keep Monaspace for code/terminal

**Files to modify**:

### 2-A: Update `src/ui/viewer-template.html`
Replace CSS variable block (`:root` section, lines ~19-130). Key changes:
- `--mm-bg-primary: #0a0e1a`
- `--mm-bg-secondary: #0f1629`
- `--mm-bg-card: #1a2035`
- `--mm-bg-card-elevated: #1f2840`
- `--mm-text-primary: #f1f5f9`
- `--mm-text-secondary: #94a3b8`
- `--mm-text-muted: #475569`
- `--mm-accent-primary: #3b82f6`
- `--mm-accent-cyan: #06b6d4`
- `--mm-accent-violet: #8b5cf6`
- `--mm-accent-amber: #f59e0b`
- `--mm-accent-emerald: #10b981`
- `--mm-border: rgba(255,255,255,0.06)`
- `--mm-border-active: rgba(59,130,246,0.4)`

Add font import (Google Fonts Inter or local fallback):
```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
```

Add body font rule:
```css
body { font-family: 'Inter', system-ui, -apple-system, sans-serif; }
code, pre, .terminal, .commit-sha { font-family: 'Monaspace Radon', monospace; }
```

### 2-B: Update CommitGraph model colors to Prefect palette
In `src/ui/viewer/components/CommitGraph.tsx` lines 6-17:
```typescript
const MODEL_COLORS: Record<string, string> = {
  claude:      '#3b82f6',  // blue (was teal)
  gemini:      '#06b6d4',  // cyan (was blue)
  openrouter:  '#8b5cf6',  // violet (was purple)
  cursor:      '#f59e0b',  // amber (unchanged)
  codex:       '#10b981',  // emerald (was green)
  windsurf:    '#38bdf8',  // sky (unchanged)
};
```

**Verification checklist**:
- [ ] `npm run build` completes without errors
- [ ] Worker starts at port 37778 and serves updated CSS
- [ ] Browser: background is deep navy (not previous dark gray)
- [ ] CommitGraph dots use new color palette
- [ ] Inter font loads in body text

---

## Phase 3: Dashboard Layout Redesign — Commits as Main View

**Goal**: Make CommitGraph + checkpoint context the PRIMARY view, not a panel.

### 3-A: Add view routing to `App.tsx`

Replace the boolean panel state with a named view state. The app has two top-level views:
1. `dashboard` — Prefect-style dashboard (default)
2. `feed` — legacy observation feed

**Changes to `src/ui/viewer/App.tsx`**:

```typescript
// Replace separate panel booleans with:
const [activeView, setActiveView] = useState<'dashboard' | 'feed'>('dashboard');
// Keep side panels that overlay both views:
const [provenanceOpen, setProvenanceOpen] = useState(false);
const [settingsOpen, setSettingsOpen] = useState(false);
const [logsOpen, setLogsOpen] = useState(false);
```

Replace the render section:
```tsx
{activeView === 'dashboard' && (
  <DashboardView
    commits={checkpoints}
    onFileClick={(f) => openProvenance({ file: f, line: 1 })}
  />
)}
{activeView === 'feed' && (
  <Feed /* existing feed props */ />
)}
```

### 3-B: Create `src/ui/viewer/components/DashboardView.tsx`

New component — the Prefect-style main dashboard. Layout:

```
┌─────────────────────────────────────────────────────────────────┐
│  [Dashboard] [Feed]     manymems       [Settings] [Theme]        │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌──────────────────── Git Tree ──────────────────────────────┐  │
│  │  CommitGraph — full-width hero, 500px min height           │  │
│  │  Colored lanes · Session phases · Attribution badges       │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                   │
│  ┌─── Sessions ──┐ ┌─── Models ─────┐ ┌── Agents ──┐ ┌─Teams ─┐ │
│  │  Active: 2    │ │ Claude 73%     │ │ claude-code│ │ 3 mbrs │ │
│  │  Idle: 5      │ │ Gemini  18%    │ │ gemini-cli │ │        │ │
│  │  Ended: 12    │ │ GPT-4    9%    │ │ cursor     │ │        │ │
│  └───────────────┘ └────────────────┘ └────────────┘ └────────┘ │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

**Props interface**:
```typescript
interface DashboardViewProps {
  commits: CommitRecord[];
  onFileClick: (filePath: string) => void;
}
```

**Sections rendered**:
1. `<GitTreeSection>` — wraps CommitGraph with new full-width styling
2. `<SessionsWidget>` — 4-state summary (active/idle/ended + total)
3. `<ModelsWidget>` — condensed from ModelsPanel (top 3 models + usage bars)
4. `<AgentsWidget>` — new (see Phase 5)
5. `<TeamWidget>` — condensed from TeamsPanel

### 3-C: Update `Header.tsx` for two-view nav

Add view toggle buttons to the Header:
```tsx
<button 
  className={`nav-tab ${activeView === 'dashboard' ? 'active' : ''}`}
  onClick={() => onViewChange('dashboard')}
>
  Dashboard
</button>
<button 
  className={`nav-tab ${activeView === 'feed' ? 'active' : ''}`}
  onClick={() => onViewChange('feed')}
>
  Feed
</button>
```

Remove the old "Commits" and "Models" panel toggle buttons from Header (they become dashboard sections).

**Verification checklist**:
- [ ] Default view is the dashboard (CommitGraph visible on load)
- [ ] "Feed" tab switches to observation feed
- [ ] CommitGraph renders at ≥500px height in dashboard view
- [ ] No layout shift between views
- [ ] Old panel toggles removed from Header

---

## Phase 4: CommitGraph Enhancements for Dashboard Hero

**Goal**: Upgrade CommitGraph.tsx to show entire.io concepts in the visual tree.

### 4-A: Attribution badges per commit row

Extend the `CommitRecord` type in `src/ui/viewer/types.ts`:
```typescript
interface CommitRecord {
  // existing fields...
  attribution?: {
    agentPercent: number;    // 0-100
    agentLines: number;
    totalLines: number;
  };
  sessionPhase?: 'active' | 'idle' | 'ended';
  checkpointType?: 'temporary' | 'committed';
  worktreeId?: string;
  subagentCount?: number;
}
```

In `CommitGraph.tsx`, add attribution badge to each row (after existing dot):
```tsx
{commit.attribution && (
  <span className="attribution-badge" 
    style={{ color: commit.attribution.agentPercent > 70 ? '#3b82f6' : '#94a3b8' }}>
    {commit.attribution.agentPercent}% AI
  </span>
)}
```

Session phase indicator (colored left border on row):
- `active` → `--mm-accent-emerald` (green)
- `idle` → `--mm-accent-amber` (amber)
- `ended` → `--mm-text-muted` (gray)

Checkpoint type icon in row:
- `temporary` → `⬡` (hollow hex, shadow branch)
- `committed` → `●` (filled circle, permanent)

### 4-B: Worktree grouping header

If commits span multiple worktrees (via `worktreeId`), group them visually with a sticky header band:
```tsx
{worktreeId && (
  <div className="worktree-badge">
    🌿 worktree: {worktreeId}
  </div>
)}
```

### 4-C: Rewind point markers

Mark commits that have rewind points available with a rewind icon (↺) in the row. Clicking opens a tooltip/drawer with:
- "Full rewind (restores files + transcript)"
- "Logs-only (restore transcript only)"

This is a display-only feature in this phase — the actual rewind command is CLI-side.

### 4-D: Concurrent session warning

If `useCommits` data reveals multiple sessions active at the same HEAD:
```tsx
{concurrentCount > 0 && (
  <div className="concurrent-warning">
    ⚠ {concurrentCount} concurrent session{concurrentCount > 1 ? 's' : ''} active
  </div>
)}
```

**Verification checklist**:
- [ ] CommitGraph rows show "N% AI" badge when attribution data present
- [ ] Phase left-border colors match session phase
- [ ] Worktree badge appears for non-main worktrees
- [ ] Rewind marker (↺) visible on rewindable commits
- [ ] TypeScript compiles clean after type extension

---

## Phase 5: New Dashboard Sections

### 5-A: `AgentsWidget.tsx` — Agents section

**Purpose**: Show which AI agents have contributed, their event counts, and current status.

```typescript
interface AgentRecord {
  name: 'claude-code' | 'gemini-cli' | 'cursor' | 'codex' | string;
  eventCounts: {
    sessionStart: number;
    turnEnd: number;
    compaction: number;
    subagentEnd: number;
  };
  lastSeen: number; // epoch ms
  isActive: boolean;
}
```

Data source: Derive from existing observations/commits — group by `model` field and map to agent names:
- `claude*` → `claude-code`
- `gemini*` → `gemini-cli`
- `cursor*` → `cursor`
- `gpt*` / `openrouter*` → `openrouter`

Display per agent:
- Agent name with icon (colored dot matching CommitGraph lane color)
- "Last seen: X min ago"
- Event count breakdown (turns / subagents)
- Active badge (green dot) if session active

### 5-B: `SessionsWidget.tsx` — Session state summary

Shows entire.io-style session phases:
```
Active   2  ●  (green)
Idle     5  ○  (amber)
Ended   12  ─  (gray)
Total   19
```

Data: From `/api/provenance/commits` — infer session phase from recency and commit patterns.

### 5-C: `ModelsWidget.tsx` — Compact models section

Condensed version of ModelsPanel for dashboard grid.
- Top 3 models with usage bars
- "View all →" link that switches to full models panel if needed

Reuse hook: `useModels` from `hooks/useModels.ts` (same data, different presentation).

### 5-D: `TeamWidget.tsx` — Compact team section

Condensed version of TeamsPanel:
- Shows member count + avatar initials
- API key count
- "Configure →" link to open full TeamsPanel drawer

Reuse hook: `useTeams` from `hooks/useTeams.ts` (already exists).

**Verification checklist**:
- [ ] AgentsWidget renders with derived agent names from model data
- [ ] SessionsWidget shows phase counts
- [ ] ModelsWidget shows top models with usage bars
- [ ] TeamWidget shows member count
- [ ] All 4 widgets visible in 2×2 or 4×1 grid below CommitGraph
- [ ] TypeScript clean

---

## Phase 6: Backend — New API Endpoints for Dashboard Data

**Goal**: Add endpoints that surface entire.io-style session and attribution data.

### 6-A: `GET /api/sessions/summary`

Returns session phase counts and active sessions list:
```json
{
  "active": 2,
  "idle": 5,
  "ended": 12,
  "total": 19,
  "sessions": [
    {
      "sessionId": "2026-06-09-abc123",
      "phase": "active",
      "baseCommit": "b60a976",
      "filesTouched": 8,
      "lastSeen": 1749445200000
    }
  ]
}
```

Data source: Derive from existing observation/session data in SQLite.

### 6-B: `GET /api/commits/:sha/attribution`

Returns attribution breakdown for a commit:
```json
{
  "sha": "b60a976",
  "agentPercent": 73,
  "agentLines": 146,
  "humanLines": 54,
  "totalLines": 200
}
```

Data source: Parse `Entire-Attribution` trailer from commit message if present, otherwise derive from observation metadata.

### 6-C: `GET /api/agents`

Returns agent list with event summaries:
```json
{
  "agents": [
    {
      "name": "claude-code",
      "model": "claude-sonnet-4-6",
      "lastSeen": 1749445200000,
      "turnCount": 42,
      "subagentCount": 8,
      "isActive": true
    }
  ]
}
```

Data source: Group existing observations by model, map to agent names.

### Implementation path:

Files to add/modify in `src/`:
1. **New route**: `src/routes/DashboardRoutes.ts` — 3 endpoints above
2. **Register in**: `src/ServerV1PostgresRoutes.ts` (follow existing `asyncHandler` pattern — see observation 18037, line 1805)
3. **New repository method**: `src/services/sqlite/sessions.ts` — `getSummary()` method
4. **SQLite migrations**: Add session_phases view if needed (follow two-chain rule: SessionStore.ts AND migrations/runner.ts)

**Anti-pattern check before implementing**:
- [ ] Route registered in `ServerV1PostgresRoutes.setupRoutes()`, NOT a new registration file
- [ ] No `actor_id` — uses `user_id` (see obs 18038)
- [ ] asyncHandler wraps all route handlers
- [ ] New migration added to BOTH SQLite chains

**Verification**:
- [ ] `curl http://127.0.0.1:37778/api/sessions/summary` returns valid JSON
- [ ] `curl http://127.0.0.1:37778/api/agents` returns agent list
- [ ] L1/L2 tests still pass: `bun test tests/provenance/ tests/sqlite/ tests/session_store.test.ts tests/context/`
- [ ] L3 tests pass: `bun test tests/integration/ --timeout 30000`

---

## Phase 7: Entire.io Feature UI Polish

**Goal**: Surface the remaining entire.io concepts as informational UI elements.

### 7-A: Shadow branch indicator in commit details

In CommitGraph expanded row, add a "Shadow Branch" field:
```
Shadow: entire/b60a976-a3f4b2  (temporary, 3 checkpoints)
```
Data from: git metadata if available, otherwise omit gracefully.

### 7-B: Secret redaction indicator

When an observation's content contains `[REDACTED]` or `REDACTED` literal:
- Show `🔒` icon on the ObservationCard
- Tooltip: "Content contains redacted secrets (API keys detected)"

Check: `observation.body.includes('REDACTED')`

### 7-C: Configuration panel widget

Add a `ConfigWidget.tsx` to the dashboard (below the 4-widget row):
```
.entire/settings.json
  Enabled: ✓  CommitLinking: prompt  LogLevel: info
  ExternalAgents: false  Telemetry: enabled
```
Data from: new `GET /api/config/entire` endpoint OR `GET /api/settings` extension.

### 7-D: Lifecycle event timeline in session detail

In the commit detail expanded area, show events as a mini timeline:
```
→ SessionStart  9:00am  claude-code
→ TurnStart     9:01am
→ TurnEnd       9:03am  checkpoint saved
→ Compaction    9:05am  shadow condensed
→ GitCommit     9:06am  ●  committed
```
Data from: observation timestamps + type fields.

**Verification checklist**:
- [ ] Shadow branch field visible in expanded commit row (when data available)
- [ ] `🔒` icon on observations with REDACTED content
- [ ] ConfigWidget renders current entire config or shows "not configured"
- [ ] Lifecycle timeline visible in at least one commit's expanded view

---

## Phase 8: Build, Test, and Commit

**Build and verify**:
```bash
# From worktree
export PATH="$PATH:/home/chicagojoe/.bun/bin"
cd /home/chicagojoe/PyCharmProjects/manymems-dashboard

# Build
npm run build

# Start test worker
mkdir -p /tmp/manymems-e2e-home
echo '{"CLAUDE_MEM_WORKER_PORT":"37778","CLAUDE_MEM_WORKER_HOST":"127.0.0.1","CLAUDE_MEM_CHROMA_ENABLED":"false","CLAUDE_MEM_LOG_LEVEL":"warn","CLAUDE_MEM_DATA_DIR":"/tmp/manymems-e2e-home"}' \
  > /tmp/manymems-e2e-home/settings.json
CLAUDE_MEM_DATA_DIR=/tmp/manymems-e2e-home bun plugin/scripts/worker-service.cjs --daemon
until curl -sf http://127.0.0.1:37778/api/health | grep -q '"initialized":true'; do sleep 1; done

# Run tests
bun test tests/provenance/ tests/sqlite/ tests/session_store.test.ts tests/context/
bun test tests/integration/ --timeout 30000
```

**TypeScript verification**:
```bash
npx tsc --noEmit -p src/ui/viewer/tsconfig.json
```

**Browser verification checklist**:
- [ ] Dashboard loads at default route showing CommitGraph as hero
- [ ] 4 widget sections visible below git tree (Sessions, Models, Agents, Teams)
- [ ] Feed tab switches to observation feed
- [ ] Prefect navy theme applied (deep navy background, Inter font)
- [ ] CommitGraph model lane colors updated to Prefect palette
- [ ] Attribution badges visible on commits that have attribution data
- [ ] No console errors
- [ ] Dark/light mode toggle still works

**Anti-pattern sweep before commit**:
```bash
# Check V1 anti-patterns
grep -r "actor_id" src/routes/ || echo "PASS"
grep -r "asyncHandler" src/routes/DashboardRoutes.ts | grep -v asyncHandler || echo "PASS"
grep -r "build-and-sync" . --include="*.ts" || echo "PASS"
grep -r "37777" src/ || echo "PASS"
```

**Commit**:
```bash
git add src/ui/viewer/components/DashboardView.tsx
git add src/ui/viewer/components/AgentsWidget.tsx
git add src/ui/viewer/components/SessionsWidget.tsx
git add src/ui/viewer/components/ModelsWidget.tsx
git add src/ui/viewer/components/TeamWidget.tsx
git add src/ui/viewer/App.tsx
git add src/ui/viewer/components/CommitGraph.tsx
git add src/ui/viewer/components/Header.tsx
git add src/ui/viewer/types.ts
git add src/ui/viewer-template.html
# + any new backend files
git commit -m "feat(ui-p1): Prefect dashboard redesign — commits-first layout, entire.io features, 4-section widgets"
```

---

## Phase 9 (Final): Push and Verification

```bash
git push -u origin feat/prefect-dashboard-entireio
```

**End state checklist**:
- [ ] Branch `feat/prefect-dashboard-entireio` pushed
- [ ] Worktree `/home/chicagojoe/PyCharmProjects/manymems-dashboard` intact
- [ ] All tests green (L1+L2+L3)
- [ ] TypeScript clean
- [ ] Dashboard shows: CommitGraph hero + Sessions/Models/Agents/Teams widgets
- [ ] Prefect Cloud theme applied (navy bg, Inter font, Prefect accent colors)
- [ ] Feed tab preserved as secondary view
- [ ] Entire.io features surfaced: attribution %, session phases, checkpoint types, concurrent warnings, agent types, rewind markers, secret redaction indicators

---

## File Change Map

| Phase | Files Modified | New Files |
|-------|---------------|-----------|
| P2 | `viewer-template.html`, `CommitGraph.tsx` | — |
| P3 | `App.tsx`, `Header.tsx` | `DashboardView.tsx` |
| P4 | `CommitGraph.tsx`, `types.ts` | — |
| P5 | — | `AgentsWidget.tsx`, `SessionsWidget.tsx`, `ModelsWidget.tsx`, `TeamWidget.tsx` |
| P6 | `ServerV1PostgresRoutes.ts` | `DashboardRoutes.ts`, `sessions.ts` (repo method) |
| P7 | `ObservationCard.tsx`, `CommitGraph.tsx` | `ConfigWidget.tsx` |

**Critical non-negotiables** (from CLAUDE.md and memory):
- Never `build-and-sync` — only `npm run build`
- Port 37778 for dev, never 37777
- Two SQLite migration chains if adding migrations
- asyncHandler in routes, never raw express handlers
- Parallel agents on different files only — App.tsx and CommitGraph.tsx in separate agent passes
