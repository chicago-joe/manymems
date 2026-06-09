# Plan 14 — Dashboard UI Polish

**Branch:** `feat/ui-dashboard-polish` (cut from `main` after merges)
**Worktree:** `/home/chicagojoe/PyCharmProjects/manymems-dashboard`
**Build target:** `npm run build` in worktree, verify worker at `:37778`

---

## Phase 0 — Discovery Summary (DONE — do not re-run)

Findings from parallel subagents:

### Branch state
- `main` HEAD: `b60a976`
- `feat/prefect-dashboard-entireio`: 1 commit ahead (`4a466d5`), 14 files, 958 ins / 105 del — clean fast-forward
- `feat/b2` does not exist locally; remote is `origin/feat/b2-promotion-workflow`
- Worktree `/home/chicagojoe/PyCharmProjects/manymems-dashboard` checks out `feat/prefect-dashboard-entireio`

### Component drill-down gaps
| Component | File | onClick | Drill-down target |
|---|---|---|---|
| `AgentsWidget` | `components/AgentsWidget.tsx` | **none** | commits filtered by agent name |
| `SessionsWidget` | `components/SessionsWidget.tsx` | **none** | commits in recency bucket |
| `ModelsWidget` | `components/ModelsWidget.tsx` | **none** | `ModelsPanel` filtered to model |
| `TeamWidget` | `components/TeamWidget.tsx` | panel-open only | already wired — no gap |
| `CommitGraph` | `components/CommitGraph.tsx` | inline expand (line 181) | already has one drill-down level |

### Light mode gaps (viewer-template.html)
- `--mm-accent-teal` used at lines 3830, 3847 but **never defined** in `:root` or `[data-theme="light"]` → transparent
- Line 3802: `.prov-timestamp` uses `var(--color-text-secondary, #8b949e)` — `--color-*` is legacy; fallback hex `#8b949e` always fires in dark mode (wrong)
- Hardcoded `rgba(59,130,246,…)` on `.widget-count` (3947), `.view-tab.active` (4023), `.team-avatar` (4001), `.agent-active-badge` (3996) — bypass theme in light mode

### Docs link (Header.tsx line 75)
- Current: `https://github.com/chicago-joe/manymems`
- Target: `https://docs.claude-mem.ai`

### Social icons to remove (Header.tsx)
- X: lines 86–96
- Discord: lines 97–107

### Full API endpoint catalog (for ApiExplorer panel)
```
Dashboard:   GET /api/sessions/summary, GET /api/commits/:sha/attribution, GET /api/agents
Data:        GET /api/observations, GET /api/summaries, GET /api/prompts
             GET /api/observation/:id, GET /api/observations/by-file
             POST /api/observations/batch, GET /api/session/:id
             POST /api/sdk-sessions/batch, GET /api/prompt/:id
             GET /api/stats, GET /api/models/stats, GET /api/projects
             GET /api/processing-status, POST /api/processing, POST /api/import
Search:      GET /api/search, GET /api/timeline, GET /api/decisions, GET /api/changes
             GET /api/how-it-works, GET /api/search/observations
             GET /api/search/sessions, GET /api/search/prompts
             GET /api/search/by-concept, GET /api/search/by-file, GET /api/search/by-type
             GET /api/context/recent, GET /api/context/timeline
             GET /api/context/preview, GET /api/context/inject
             POST /api/context/semantic, GET /api/onboarding/explainer
             GET /api/timeline/by-query, GET /api/search/help
Provenance:  POST /api/provenance/link-commit, GET /api/provenance/by-line
             GET /api/provenance/commits, GET /api/provenance/by-commit
Observations: POST /api/observations/:id/promote, GET /api/observations/:id/staleness
              POST /api/observations/multimodal, GET /api/observations/:id/content
Memory:      POST /api/memory/save
Settings:    GET /api/settings, POST /api/settings
             GET /api/mcp/status, POST /api/mcp/toggle
             GET /api/branch/status, POST /api/branch/switch, POST /api/branch/update
```

---

## Pre-flight — Merge Branches → main, Cut New Branch

**Working directory: `/home/chicagojoe/PyCharmProjects/manymems` (main worktree)**

```bash
export PATH="$PATH:/home/chicagojoe/.bun/bin"

# 1. Fetch all remotes
git fetch --all

# 2. Merge feat/prefect-dashboard-entireio → main (fast-forward, 1 commit ahead)
git checkout main
git merge --ff-only feat/prefect-dashboard-entireio
# Expected: "Fast-forward" — 14 files, 958 ins / 105 del

# 3. Check feat/b2-promotion-workflow
git log --oneline -n 5 origin/feat/b2-promotion-workflow
git diff --stat main origin/feat/b2-promotion-workflow | tail -5
# If clean (no conflicts): merge. If conflicts: skip and note for manual resolution.
git merge --no-ff origin/feat/b2-promotion-workflow -m "merge(feat/b2): promotion workflow from remote"
# If merge fails: git merge --abort && echo "SKIP b2 — conflicts, manual resolution needed"

# 4. Push main
git push origin main

# 5. Cut new branch
git checkout -b feat/ui-dashboard-polish

# 6. Update worktree to new branch
git -C /home/chicagojoe/PyCharmProjects/manymems-dashboard checkout feat/ui-dashboard-polish
```

**Verify:** `git log --oneline -n 3` shows feat/prefect commit at top of main.

---

## Phase 1 — Branding: New Icon, Hacker Font, Header Cleanup

**All edits in worktree: `/home/chicagojoe/PyCharmProjects/manymems-dashboard`**

### 1-A: New manymems SVG icon

Create `/home/chicagojoe/PyCharmProjects/manymems-dashboard/src/ui/assets/manymems-icon.svg`:

Design spec: terminal/matrix aesthetic — a stylized `>_` prompt inside a rounded-square frame with a subtle circuit-trace border. Monochrome so it works on dark and light backgrounds.

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="none">
  <!-- Outer rounded frame -->
  <rect x="1" y="1" width="30" height="30" rx="6" stroke="currentColor" stroke-width="1.5"/>
  <!-- Corner accent dots (circuit style) -->
  <circle cx="5" cy="5" r="1" fill="currentColor" opacity="0.5"/>
  <circle cx="27" cy="5" r="1" fill="currentColor" opacity="0.5"/>
  <circle cx="5" cy="27" r="1" fill="currentColor" opacity="0.5"/>
  <circle cx="27" cy="27" r="1" fill="currentColor" opacity="0.5"/>
  <!-- Caret prompt -->
  <polyline points="7,13 12,16 7,19" stroke="currentColor" stroke-width="2"
            stroke-linecap="round" stroke-linejoin="round"/>
  <!-- Underscore cursor (blinking via CSS) -->
  <line x1="14" y1="20" x2="25" y2="20" stroke="currentColor" stroke-width="2"
        stroke-linecap="round" class="mm-cursor"/>
</svg>
```

Add blink CSS to `viewer-template.html` `<style>`:
```css
@keyframes mm-blink { 0%,49%{opacity:1} 50%,100%{opacity:0} }
.mm-cursor { animation: mm-blink 1.2s step-end infinite; }
```

### 1-B: Hacker font for title

In `viewer-template.html` `<head>`, replace the existing Google Fonts `<link>` line with:
```html
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Share+Tech+Mono&display=swap" rel="stylesheet">
```

Update `.logo-text` CSS rule (around line 592):
```css
.logo-text {
  font-family: 'Share Tech Mono', 'Monaspace Radon', monospace;
  font-weight: 400;
  font-size: 20px;
  letter-spacing: 0.04em;
  color: var(--mm-accent-amber);
  line-height: 1;
  padding-top: 1px;
  text-shadow: 0 0 12px rgba(245,158,11,0.4);
}
[data-theme="light"] .logo-text {
  text-shadow: none;
}
```

### 1-C: Update Header.tsx

File: `src/ui/viewer/components/Header.tsx`

1. **Remove X link** (lines 86–96) — delete the entire `<a href="https://x.com/…">…</a>` block
2. **Remove Discord link** (lines 97–107) — delete the entire `<a href="https://discord.gg/…">…</a>` block
3. **Update docs link** (line 75): change `href` from `https://github.com/chicago-joe/manymems` to `https://docs.claude-mem.ai`
4. **Replace logomark `<img>`** (line 49): swap `claude-mem-logomark.webp` for inline SVG icon

Replace:
```tsx
<img src="claude-mem-logomark.webp" alt="" className={`logomark ${isProcessing ? 'spinning' : ''}`} />
```
With:
```tsx
<svg viewBox="0 0 32 32" fill="none" className={`logomark ${isProcessing ? 'spinning' : ''}`}
     xmlns="http://www.w3.org/2000/svg" width="28" height="28"
     style={{ color: 'var(--mm-accent-amber)' }}>
  <rect x="1" y="1" width="30" height="30" rx="6" stroke="currentColor" strokeWidth="1.5"/>
  <circle cx="5" cy="5" r="1" fill="currentColor" opacity="0.5"/>
  <circle cx="27" cy="5" r="1" fill="currentColor" opacity="0.5"/>
  <circle cx="5" cy="27" r="1" fill="currentColor" opacity="0.5"/>
  <circle cx="27" cy="27" r="1" fill="currentColor" opacity="0.5"/>
  <polyline points="7,13 12,16 7,19" stroke="currentColor" strokeWidth="2"
            strokeLinecap="round" strokeLinejoin="round"/>
  <line x1="14" y1="20" x2="25" y2="20" stroke="currentColor" strokeWidth="2"
        strokeLinecap="round" className="mm-cursor"/>
</svg>
```

5. **Add API tab** to `<nav className="view-tabs">` (after the Feed button):
```tsx
<button
  className={`view-tab${activeView === 'api' ? ' active' : ''}`}
  onClick={() => onViewChange('api')}
>
  API
</button>
```

6. **Update HeaderProps** interface and `activeView` type:
```tsx
activeView: 'dashboard' | 'feed' | 'api';
onViewChange: (view: 'dashboard' | 'feed' | 'api') => void;
```

**Verification:**
```bash
cd /home/chicagojoe/PyCharmProjects/manymems-dashboard
npx tsc --noEmit
# Must exit 0
grep -n "x.com\|discord.gg" src/ui/viewer/components/Header.tsx
# Must return nothing
grep -n "docs.claude-mem.ai" src/ui/viewer/components/Header.tsx
# Must return 1 line
```

---

## Phase 2 — Light Mode Fixes

**File: `src/ui/viewer-template.html`**

### 2-A: Define missing `--mm-accent-teal`

In `:root` block (after `--mm-accent-red` line ~37), add:
```css
--mm-accent-teal: #2dd4bf;
```

In `[data-theme="light"]` block (after `--mm-accent-red` override), add:
```css
--mm-accent-teal: #0d9488;
```

### 2-B: Fix `.prov-timestamp` (line ~3802)

Change:
```css
color: var(--color-text-secondary, #8b949e);
```
To:
```css
color: var(--mm-text-muted);
```

### 2-C: Replace hardcoded rgba with CSS-variable-based expressions

Find and replace these rules:

| Rule | Old hardcoded value | Replace with |
|---|---|---|
| `.widget-count` background | `rgba(59,130,246,0.12)` | `color-mix(in srgb, var(--mm-accent-primary) 12%, transparent)` |
| `.view-tab.active` background | `rgba(59,130,246,0.1)` | `color-mix(in srgb, var(--mm-accent-primary) 10%, transparent)` |
| `.team-avatar` background | `rgba(59,130,246,0.15)` | `color-mix(in srgb, var(--mm-accent-primary) 15%, transparent)` |
| `.agent-active-badge` background | `rgba(16,185,129,0.15)` | `color-mix(in srgb, var(--mm-accent-emerald) 15%, transparent)` |
| `.checkpoint-model-badge` background | `rgba(45,212,191,0.15)` | `color-mix(in srgb, var(--mm-accent-teal) 15%, transparent)` |
| `.checkpoint-file-chip` background | `rgba(245,158,11,0.12)` | `color-mix(in srgb, var(--mm-accent-amber) 12%, transparent)` |
| `.worktree-badge` background | `rgba(16,185,129,0.1)` | `color-mix(in srgb, var(--mm-accent-emerald) 10%, transparent)` |
| `.worktree-badge` color | `#10b981` | `var(--mm-accent-emerald)` |
| `.concurrent-warning` background | `rgba(245,158,11,0.12)` | `color-mix(in srgb, var(--mm-accent-amber) 12%, transparent)` |
| `.concurrent-warning` color | `#f59e0b` | `var(--mm-accent-amber)` |

### 2-D: Light mode header background

The `.header` element uses `--color-bg-header` / `--color-bg-primary` (old vars). Add a light-mode override:
```css
[data-theme="light"] .header {
  background: var(--mm-bg-secondary);
  border-bottom-color: var(--mm-border);
}
[data-theme="light"] .settings-btn,
[data-theme="light"] .theme-toggle-btn,
[data-theme="light"] .icon-link {
  background: var(--mm-bg-card);
  border-color: var(--mm-border);
  color: var(--mm-text-secondary);
}
[data-theme="light"] .settings-btn:hover,
[data-theme="light"] .icon-link:hover {
  background: var(--mm-bg-hover);
  color: var(--mm-text-primary);
}
```

**Verification:**
```bash
grep -n "mm-accent-teal" src/ui/viewer-template.html | head -10
# Must show definition in :root AND [data-theme="light"] blocks
grep -c "color-mix" src/ui/viewer-template.html
# Should be >= 9
```

---

## Phase 3 — Widget Drill-Down

**All files in `/home/chicagojoe/PyCharmProjects/manymems-dashboard/src/ui/viewer/`**

### 3-A: Add `onDrillDown` prop to `DashboardView`

`components/DashboardView.tsx` — update props interface:
```tsx
interface DashboardViewProps {
  settings: Settings;
  onFileClick: (filePath: string) => void;
  onTeamsPanelOpen?: () => void;
  onDrillDown: (filter: DrillDownFilter) => void;  // NEW
}

export type DrillDownFilter =
  | { type: 'agent'; agentName: string }
  | { type: 'model'; model: string }
  | { type: 'bucket'; bucket: 'active' | 'idle' | 'ended' };
```

Export `DrillDownFilter` from `types.ts` or inline in the component (inline is fine — it's local).

### 3-B: `AgentsWidget.tsx`

Add prop: `onAgentClick?: (agentName: string) => void`

Update each `<div className="agent-row">` to:
```tsx
<div
  key={agent.name}
  className={`agent-row${onAgentClick ? ' agent-row--clickable' : ''}`}
  onClick={() => onAgentClick?.(agent.name)}
  title={onAgentClick ? `Filter to ${agent.name}` : undefined}
>
```

Pass `onAgentClick` from `DashboardView`:
```tsx
<AgentsWidget commits={commits} onAgentClick={name => onDrillDown({ type: 'agent', agentName: name })} />
```

Add CSS to `viewer-template.html`:
```css
.agent-row--clickable { cursor: pointer; border-radius: 4px; }
.agent-row--clickable:hover { background: var(--mm-bg-hover); margin: 0 -4px; padding: 0 4px; }
```

### 3-C: `SessionsWidget.tsx`

Add prop: `onBucketClick?: (bucket: 'active' | 'idle' | 'ended') => void`

Update each bucket `<div className="session-row">`:
```tsx
<div
  className={`session-row${onBucketClick ? ' session-row--clickable' : ''}`}
  onClick={() => onBucketClick?.(bucket)}
>
```

Pass from `DashboardView`:
```tsx
<SessionsWidget commits={commits} onBucketClick={b => onDrillDown({ type: 'bucket', bucket: b })} />
```

Add CSS:
```css
.session-row--clickable { cursor: pointer; border-radius: 4px; }
.session-row--clickable:hover { background: var(--mm-bg-hover); margin: 0 -4px; padding: 0 4px; }
```

### 3-D: `ModelsWidget.tsx`

Add prop: `onModelClick?: (model: string) => void`

Update each model row's `<div>` to be clickable. Pass from `DashboardView`:
```tsx
<ModelsWidget onModelClick={m => onDrillDown({ type: 'model', model: m })} />
```

### 3-E: `App.tsx` — wire drill-down to feed view with filter

Add state:
```tsx
const [drillDownFilter, setDrillDownFilter] = useState<DrillDownFilter | null>(null);
```

Handle drill-down by switching to feed view and applying model/project filter:
```tsx
const handleDrillDown = useCallback((filter: DrillDownFilter) => {
  setDrillDownFilter(filter);
  setActiveView('feed');
  if (filter.type === 'model') setModelFilter(filter.model);
  // agent/bucket: set currentFilter or leave as-is — feed shows all, highlighted
}, []);
```

Pass to DashboardView:
```tsx
<DashboardView
  settings={settings}
  onFileClick={…}
  onTeamsPanelOpen={…}
  onDrillDown={handleDrillDown}   // NEW
/>
```

When `activeView` switches back to dashboard, clear `drillDownFilter`.

**Verification:**
```bash
npx tsc --noEmit
# Must exit 0
grep -n "onAgentClick\|onBucketClick\|onModelClick\|onDrillDown" \
  src/ui/viewer/components/AgentsWidget.tsx \
  src/ui/viewer/components/SessionsWidget.tsx \
  src/ui/viewer/components/ModelsWidget.tsx \
  src/ui/viewer/components/DashboardView.tsx \
  src/ui/viewer/App.tsx
# Must show hits in all 5 files
```

---

## Phase 4 — API Explorer Panel

### 4-A: Create `ApiExplorerPanel.tsx`

Create `src/ui/viewer/components/ApiExplorerPanel.tsx`:

```tsx
import React, { useState } from 'react';

interface Endpoint {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  description: string;
}

interface ApiGroup {
  name: string;
  endpoints: Endpoint[];
}

const API_GROUPS: ApiGroup[] = [
  {
    name: 'Dashboard',
    endpoints: [
      { method: 'GET', path: '/api/sessions/summary', description: 'Active / idle / ended session counts' },
      { method: 'GET', path: '/api/commits/:sha/attribution', description: 'AI attribution % for a commit' },
      { method: 'GET', path: '/api/agents', description: 'Detected agents and activity' },
    ],
  },
  {
    name: 'Data',
    endpoints: [
      { method: 'GET', path: '/api/observations', description: 'Paginated observations' },
      { method: 'GET', path: '/api/summaries', description: 'Session summaries' },
      { method: 'GET', path: '/api/prompts', description: 'User prompts' },
      { method: 'GET', path: '/api/observation/:id', description: 'Single observation by ID' },
      { method: 'GET', path: '/api/observations/by-file', description: 'Observations touching a file' },
      { method: 'POST', path: '/api/observations/batch', description: 'Batch fetch observations by IDs' },
      { method: 'GET', path: '/api/session/:id', description: 'Session by ID' },
      { method: 'POST', path: '/api/sdk-sessions/batch', description: 'Batch fetch SDK sessions' },
      { method: 'GET', path: '/api/prompt/:id', description: 'Prompt by ID' },
      { method: 'GET', path: '/api/stats', description: 'Global counts (obs, sessions, summaries)' },
      { method: 'GET', path: '/api/models/stats', description: 'Per-model observation statistics' },
      { method: 'GET', path: '/api/projects', description: 'Project list with platform source filter' },
      { method: 'GET', path: '/api/processing-status', description: 'Queue depth and processing state' },
      { method: 'POST', path: '/api/processing', description: 'Set processing mode' },
      { method: 'POST', path: '/api/import', description: 'Import observation batch' },
    ],
  },
  {
    name: 'Search',
    endpoints: [
      { method: 'GET', path: '/api/search', description: 'Unified full-text search' },
      { method: 'GET', path: '/api/timeline', description: 'Unified timeline' },
      { method: 'GET', path: '/api/decisions', description: 'Decision observations' },
      { method: 'GET', path: '/api/changes', description: 'Change observations' },
      { method: 'GET', path: '/api/how-it-works', description: 'How-it-works observations' },
      { method: 'GET', path: '/api/search/observations', description: 'Search observations' },
      { method: 'GET', path: '/api/search/sessions', description: 'Search sessions' },
      { method: 'GET', path: '/api/search/prompts', description: 'Search prompts' },
      { method: 'GET', path: '/api/search/by-concept', description: 'Search by concept' },
      { method: 'GET', path: '/api/search/by-file', description: 'Search by file path' },
      { method: 'GET', path: '/api/search/by-type', description: 'Search by observation type' },
      { method: 'GET', path: '/api/context/recent', description: 'Recent context for injection' },
      { method: 'GET', path: '/api/context/timeline', description: 'Context timeline' },
      { method: 'GET', path: '/api/context/preview', description: 'Context preview' },
      { method: 'GET', path: '/api/context/inject', description: 'Inject context into session' },
      { method: 'POST', path: '/api/context/semantic', description: 'Semantic context search' },
      { method: 'GET', path: '/api/timeline/by-query', description: 'Timeline filtered by query' },
      { method: 'GET', path: '/api/search/help', description: 'Search help and syntax reference' },
    ],
  },
  {
    name: 'Provenance',
    endpoints: [
      { method: 'POST', path: '/api/provenance/link-commit', description: 'Link session to git commit' },
      { method: 'GET', path: '/api/provenance/by-line', description: 'Provenance for a file line' },
      { method: 'GET', path: '/api/provenance/commits', description: 'All commits with provenance' },
      { method: 'GET', path: '/api/provenance/by-commit', description: 'Sessions and files for a commit SHA' },
    ],
  },
  {
    name: 'Observations',
    endpoints: [
      { method: 'POST', path: '/api/observations/:id/promote', description: 'Promote observation to memory' },
      { method: 'GET', path: '/api/observations/:id/staleness', description: 'Staleness score for observation' },
      { method: 'POST', path: '/api/observations/multimodal', description: 'Multimodal observation capture' },
      { method: 'GET', path: '/api/observations/:id/content', description: 'Raw content for observation' },
    ],
  },
  {
    name: 'Memory',
    endpoints: [
      { method: 'POST', path: '/api/memory/save', description: 'Save observation as memory' },
    ],
  },
  {
    name: 'Settings',
    endpoints: [
      { method: 'GET', path: '/api/settings', description: 'Current worker settings' },
      { method: 'POST', path: '/api/settings', description: 'Update worker settings' },
      { method: 'GET', path: '/api/mcp/status', description: 'MCP server connection status' },
      { method: 'POST', path: '/api/mcp/toggle', description: 'Enable / disable MCP server' },
      { method: 'GET', path: '/api/branch/status', description: 'Current git branch info' },
      { method: 'POST', path: '/api/branch/switch', description: 'Switch active branch' },
      { method: 'POST', path: '/api/branch/update', description: 'Pull latest on current branch' },
    ],
  },
];

export function ApiExplorerPanel() {
  const [openGroup, setOpenGroup] = useState<string>('Dashboard');

  return (
    <div className="api-explorer">
      <div className="api-explorer-header">
        <h2 className="api-explorer-title">
          <span className="dashboard-section-icon">◈</span>
          API Reference
        </h2>
        <a
          href="https://docs.claude-mem.ai"
          target="_blank"
          rel="noopener noreferrer"
          className="api-explorer-docs-link"
        >
          Full Docs ↗
        </a>
      </div>
      <div className="api-explorer-body">
        <nav className="api-group-nav">
          {API_GROUPS.map(g => (
            <button
              key={g.name}
              className={`api-group-btn${openGroup === g.name ? ' active' : ''}`}
              onClick={() => setOpenGroup(g.name)}
            >
              {g.name}
              <span className="api-group-count">{g.endpoints.length}</span>
            </button>
          ))}
        </nav>
        <div className="api-endpoint-list">
          {(API_GROUPS.find(g => g.name === openGroup)?.endpoints ?? []).map(ep => (
            <div key={ep.path} className="api-endpoint-row">
              <span className={`api-method-badge api-method-badge--${ep.method.toLowerCase()}`}>
                {ep.method}
              </span>
              <code className="api-endpoint-path">{ep.path}</code>
              <span className="api-endpoint-desc">{ep.description}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
```

### 4-B: CSS for ApiExplorer in `viewer-template.html`

Append to the end of `<style>` block:
```css
/* ── API Explorer ──────────────────────────────────────────────── */
.api-explorer {
  max-width: 900px;
  margin: 1.5rem auto;
  padding: 0 1.5rem 3rem;
}
.api-explorer-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1.25rem;
}
.api-explorer-title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--mm-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin: 0;
}
.api-explorer-docs-link {
  font-size: 0.75rem;
  color: var(--mm-accent-primary);
  text-decoration: none;
  font-family: 'Share Tech Mono', monospace;
}
.api-explorer-docs-link:hover { text-decoration: underline; }
.api-explorer-body { display: flex; gap: 1rem; }
.api-group-nav {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  min-width: 130px;
  flex-shrink: 0;
}
.api-group-btn {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: none;
  border: 1px solid transparent;
  border-radius: 6px;
  padding: 0.375rem 0.625rem;
  font-size: 0.78rem;
  font-weight: 500;
  color: var(--mm-text-secondary);
  cursor: pointer;
  text-align: left;
  transition: all 0.12s;
}
.api-group-btn:hover { background: var(--mm-bg-hover); color: var(--mm-text-primary); }
.api-group-btn.active {
  background: color-mix(in srgb, var(--mm-accent-primary) 10%, transparent);
  border-color: var(--mm-border-active);
  color: var(--mm-accent-primary);
}
.api-group-count {
  font-size: 0.65rem;
  background: var(--mm-border);
  color: var(--mm-text-muted);
  padding: 0.1rem 0.4rem;
  border-radius: 9999px;
  margin-left: 0.25rem;
}
.api-endpoint-list {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}
.api-endpoint-row {
  display: flex;
  align-items: baseline;
  gap: 0.625rem;
  padding: 0.5rem 0.75rem;
  border-radius: 6px;
  background: var(--mm-bg-card);
  border: 1px solid var(--mm-border);
  transition: background 0.12s;
}
.api-endpoint-row:hover { background: var(--mm-bg-hover); }
.api-method-badge {
  font-family: 'Share Tech Mono', monospace;
  font-size: 0.65rem;
  font-weight: 700;
  padding: 0.15rem 0.45rem;
  border-radius: 4px;
  min-width: 42px;
  text-align: center;
  flex-shrink: 0;
}
.api-method-badge--get   { background: color-mix(in srgb, var(--mm-accent-emerald) 15%, transparent); color: var(--mm-accent-emerald); }
.api-method-badge--post  { background: color-mix(in srgb, var(--mm-accent-primary) 15%, transparent); color: var(--mm-accent-primary); }
.api-method-badge--put   { background: color-mix(in srgb, var(--mm-accent-amber) 15%, transparent); color: var(--mm-accent-amber); }
.api-method-badge--delete{ background: color-mix(in srgb, var(--mm-accent-red) 15%, transparent); color: var(--mm-accent-red); }
.api-endpoint-path {
  font-family: 'Share Tech Mono', monospace;
  font-size: 0.78rem;
  color: var(--mm-text-primary);
  flex-shrink: 0;
}
.api-endpoint-desc {
  font-size: 0.72rem;
  color: var(--mm-text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
```

### 4-C: Wire into `App.tsx`

1. Import `ApiExplorerPanel`
2. Change `activeView` type to `'dashboard' | 'feed' | 'api'`
3. Add third branch in render:
```tsx
} : activeView === 'api' ? (
  <ApiExplorerPanel />
) : (
  <Feed … />
)}
```

**Verification:**
```bash
npx tsc --noEmit
# Must exit 0
grep -n "api-explorer\|ApiExplorer" \
  src/ui/viewer/components/ApiExplorerPanel.tsx \
  src/ui/viewer/App.tsx \
  src/ui/viewer-template.html | head -20
# Must show hits in all 3 files
```

---

## Phase 5 — Build, Test, Commit, PR

**Working directory: `/home/chicagojoe/PyCharmProjects/manymems-dashboard`**

```bash
export PATH="$PATH:/home/chicagojoe/.bun/bin"

# 1. TypeScript compile check
npx tsc --noEmit
# Must exit 0 before proceeding

# 2. Build
npm run build

# 3. Kill any running worker on 37778, restart
pkill -f "worker-service.cjs" 2>/dev/null; sleep 1
CLAUDE_MEM_DATA_DIR=~/.claude-mem \
CLAUDE_MEM_WORKER_PORT=37778 \
CLAUDE_MEM_WORKER_HOST=127.0.0.1 \
CLAUDE_MEM_CHROMA_ENABLED=false \
CLAUDE_MEM_LOG_LEVEL=warn \
  bun /home/chicagojoe/PyCharmProjects/manymems-dashboard/plugin/scripts/worker-service.cjs --daemon
until curl -sf http://127.0.0.1:37778/api/health | grep -q '"initialized":true'; do sleep 1; done
echo "Worker healthy"

# 4. Smoke test the new endpoints and UI
curl -sf http://127.0.0.1:37778/api/agents | python3 -c "import sys,json; d=json.load(sys.stdin); print('agents OK:', len(d['agents']))"

# 5. Run L1/L2 tests
cd /home/chicagojoe/PyCharmProjects/manymems-dashboard
bun test tests/provenance/ tests/sqlite/ tests/session_store.test.ts tests/context/
# Must pass

# 6. Commit
git -C /home/chicagojoe/PyCharmProjects/manymems-dashboard add -p
# Stage all modified src/ui files + new ApiExplorerPanel.tsx
git -C /home/chicagojoe/PyCharmProjects/manymems-dashboard commit -m "$(cat <<'EOF'
feat(ui-p14): dashboard polish — hacker icon/font, API explorer, drill-down, light mode

- New SVG terminal/matrix icon replaces claude-mem-logomark
- Share Tech Mono hacker font for manymems title with amber glow
- Remove X and Discord header icons; docs link → docs.claude-mem.ai
- API tab + ApiExplorerPanel: all endpoints grouped by category, method badges
- Widget drill-down: AgentsWidget/SessionsWidget/ModelsWidget click → feed filter
- Light mode: fix --mm-accent-teal undefined, replace legacy --color-* refs,
  replace hardcoded rgba with color-mix() CSS variables

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"

# 7. Push and create PR
git -C /home/chicagojoe/PyCharmProjects/manymems-dashboard push -u origin feat/ui-dashboard-polish
gh pr create \
  --base main \
  --head feat/ui-dashboard-polish \
  --title "feat(ui-p14): dashboard polish — hacker branding, API explorer, drill-down, light mode" \
  --body "$(cat <<'EOF'
## Summary
- New SVG terminal/caret icon + Share Tech Mono hacker font for title
- Removed unused X and Discord icons; docs link → https://docs.claude-mem.ai
- New API Explorer panel: all 40+ endpoints browseable with method badges and descriptions
- Widget click-through drill-down: Agents, Sessions, Models widgets now navigate to Feed with filter
- Light mode: fixed undefined --mm-accent-teal, eliminated legacy --color-* fallbacks, replaced hardcoded rgba with color-mix() CSS variables

## Test plan
- [ ] TypeScript compiles clean (`npx tsc --noEmit`)
- [ ] Build succeeds (`npm run build`)
- [ ] Worker starts at :37778, /api/agents returns data
- [ ] L1/L2 tests pass
- [ ] Light mode toggle: dashboard looks clean, no dark-on-dark elements
- [ ] Header: no X/Discord icons, docs link opens docs.claude-mem.ai
- [ ] API tab renders all endpoint groups with correct method badges
- [ ] Agent/Session/Model widget rows are clickable and switch to Feed view

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"

# 8. Merge PR and sync main
gh pr merge --squash --auto
git fetch origin
git checkout main
git pull --ff-only origin main
echo "Done — main is up to date"
```

---

## Anti-Pattern Guards

| Guard | Check |
|---|---|
| Never touch port 37777 | `grep -r "37777" src/` must return nothing new |
| Never run build-and-sync | Banned — only `npm run build` |
| No parallel agents on App.tsx | Do all App.tsx wiring in one sequential pass |
| Type check after each Phase | `npx tsc --noEmit` between phases, not just at end |
| No `--no-verify` commits | Hook violations must be fixed, not bypassed |
| `files_modified`/`files_read` are JSON strings | `JSON.parse()` them, never split on comma |

---

## File Change Manifest

| File | Phase | Change type |
|---|---|---|
| `src/ui/viewer/components/Header.tsx` | 1 | Edit: remove X/Discord, update docs link, inline SVG icon, API tab, type update |
| `src/ui/viewer-template.html` | 1,2,4 | Edit: Google Font + Share Tech Mono, logo-text CSS, blink anim, teal var, color-mix, light overrides, API Explorer CSS |
| `src/ui/viewer/components/AgentsWidget.tsx` | 3 | Edit: add `onAgentClick` prop, clickable rows |
| `src/ui/viewer/components/SessionsWidget.tsx` | 3 | Edit: add `onBucketClick` prop, clickable rows |
| `src/ui/viewer/components/ModelsWidget.tsx` | 3 | Edit: add `onModelClick` prop, clickable rows |
| `src/ui/viewer/components/DashboardView.tsx` | 3 | Edit: add `onDrillDown` prop, wire to all three widgets |
| `src/ui/viewer/App.tsx` | 3,4 | Edit: drill-down state, activeView type update, ApiExplorerPanel route |
| `src/ui/viewer/components/ApiExplorerPanel.tsx` | 4 | **New file** |
