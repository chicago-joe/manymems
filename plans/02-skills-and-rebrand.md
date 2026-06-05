# manymems — Plan 02: Skills System + Rebrand

## Phase 0 — Documentation Discovery (DONE — consolidated findings)

### 0.1 Architecture facts (verified, with anchors)

**Backend — what already exists:**
- `code_provenance` table (migration 36) — `SessionStore.ts:88`
- `SessionStore.linkCommitToProvenance(changedFiles, commitSha, sinceEpoch?)` — `SessionStore.ts:2582`
- `SessionStore.getProvenanceByLine(filePath, line)` → `ProvenanceRecord[]` — `SessionStore.ts:2596`
- `SessionStore.getProvenanceBySymbol(filePath, qualifiedName)` → `ProvenanceRecord[]` — `SessionStore.ts:2601`
- `SessionStore.getPromptTextById(userPromptId)` → `string | null` — `SessionStore.ts:2606`
- `TranscriptEventProcessor` + `TranscriptWatcher` — JSONL capture already live — `services/transcripts/`
- `ProvenanceRoutes` class — `services/worker/http/routes/ProvenanceRoutes.ts` — **`handleCommits` method MISSING**
- Post-commit hook installed and fires `linkCommitToProvenance` — obs 17747

**UI — what exists (all in `src/ui/viewer/`):**
- `App.tsx` (192 lines) — models/commits/provenance panel state present
- `Header.tsx` (171 lines) — multi-model + commits panel toggle props present
- `CommitsPanel.tsx` (89 lines), `ProvenanceDrawer.tsx` (77 lines)
- `ThemeToggle.tsx` + `useTheme.ts` — light/dark/system preference
- `WelcomeCard.tsx` (219 lines) — **claude-mem branded, needs full rewrite**
- CSS: `viewer-template.html` CSS block + Cartographer's Terminal side-panel CSS

**Plugin skills — existing format:**
- `plugin/skills/<name>/SKILL.md` — YAML frontmatter + markdown body
- Reference: `plugin/skills/smart-explore/SKILL.md` (191 lines)

### 0.2 What already exists vs. what we build

| Thing | Status |
|---|---|
| `code_provenance` table + A1–A5 query surface | Done |
| Post-commit hook (linkCommitToProvenance) | Done |
| CommitsPanel, ProvenanceDrawer UI components | Done |
| `/api/commits` HTTP route (handleCommits) | **Missing** |
| Plugin skills for provenance workflows | **Missing** |
| manymems dark theme + branding | **Missing** |

### 0.3 Allowed APIs (cite-before-use; do NOT invent)

- `SessionStore.getProvenanceByLine(filePath, line)` — `SessionStore.ts:2596`
- `SessionStore.getProvenanceBySymbol(filePath, qualifiedName)` — `SessionStore.ts:2601`
- `SessionStore.getPromptTextById(userPromptId)` — `SessionStore.ts:2606`
- `SessionStore.getAllRecentObservations(limit)` — `SessionStore.ts:1241`
- HTTP route pattern: copy `DataRoutes.ts` handler structure
- Skill format: copy frontmatter pattern from `plugin/skills/smart-explore/SKILL.md:1-5`
- MCP tools to wrap in skills: `mcp__plugin_claude-mem_mcp-search__smart_search`, `get_observations`, `get_code_provenance`, `observation_search`

### 0.4 Port boundary (CRITICAL)

| Port | Process | Rule |
|------|---------|------|
| **37777** | Stock claude-mem (live session daemon) | **NEVER touch** — no `build-and-sync` |
| **37778** | Isolated manymems test worker | OK for all development and integration tests |

`npm run build-and-sync` syncs the manymems build to `~/.claude/plugins/marketplaces/thedotmack/` and restarts 37777 — this overwrites the production claude-mem plugin. **Never run it during development.** Use `npm run build` only. Verify against 37778 using the isolated worker.

### 0.5 Anti-pattern guards

- **Do NOT** assume `handleCommits` exists — it must be created
- **Do NOT** write CSS into component files — use `viewer-template.html` CSS injection point
- **Do NOT** run parallel agents on `App.tsx` — UI wiring in a single sequential pass only
- **Do NOT** split `files_modified`/`files_read` on comma — they are JSON-encoded arrays; use `JSON.parse()`
- **Do NOT** add any migration to only one chain — BOTH `SessionStore.ts` constructor AND `migrations/runner.ts`

---

## TRACK SK — Skills System

Skills tell your agent *when and how* to use manymems MCP tools — so instead of manually building search queries or tracing provenance by hand, you ask in plain English.

Pattern reference: entire.io has `search`, `explain`, `what-happened`, `session-handoff`, `session-to-skill` — manymems wraps its own MCP surface with an equivalent set.

### Phase SK-1 — `/api/commits` HTTP route (backend prerequisite)

The CommitsPanel already exists in the UI but has no backend route to call. This phase adds the missing `handleCommits` method to `ProvenanceRoutes`.

**File to modify:** `src/services/worker/http/routes/ProvenanceRoutes.ts`

**1.1 Add `GET /api/commits` handler**

Copy the handler pattern from `DataRoutes.ts`'s `handleGetObservations`. The endpoint returns commits with linked provenance entries:

```ts
// Response shape
interface CommitEntry {
  commit_sha: string;
  committed_at_epoch: number;
  files_changed: string[];           // from provenance rows
  prompt_text: string | null;        // from user_prompts via getPromptTextById
  observation_count: number;
  agent_model: string | null;
}
```

**1.2 Wire route into setupRoutes**

```ts
app.get('/api/commits', this.handleCommits.bind(this));
```

**1.3 Implementation**

Query `code_provenance` grouped by `commit_sha`, join `user_prompts` for prompt text, return sorted by `committed_at_epoch DESC`. Limit defaults to 50.

**Verification — Phase SK-1:**
- `curl http://127.0.0.1:37777/api/commits | jq .` returns JSON array
- L3 integration test: `tests/integration/ProvenanceRoutes.test.ts` — add a `GET /api/commits` case
- `bun test tests/integration/ --timeout 30000` passes

---

### Phase SK-2 — Core skills: search + explain + what-happened

**Location:** `plugin/skills/<name>/SKILL.md`

Copy the frontmatter structure from `plugin/skills/smart-explore/SKILL.md:1-5`.

**2.1 `search` skill** — `plugin/skills/search/SKILL.md`

Wraps `mcp__plugin_claude-mem_mcp-search__search` + `observation_search` + `get_observations`.

Trigger: user asks about prior work, earlier prompts, similar implementations, or "what did we do about X".

Workflow:
1. Call `search(query, project, limit=20, orderBy="date_desc")`
2. If thin (<3 results), broaden: `observation_search(query, limit=50)`
3. Call `get_observations(ids=[...])` for the top hits
4. Synthesize: summarize findings in 3–5 bullets with session timestamps

**2.2 `explain` skill** — `plugin/skills/explain/SKILL.md`

Wraps `mcp__plugin_claude-mem_mcp-search__get_code_provenance` to trace a function, file, or line back to the prompt and session that produced it.

Trigger: user asks "why does this function exist", "who wrote this", "what was the reasoning behind X", or pastes a file:line reference.

Workflow:
1. Parse file path + line number from user's message
2. Call `get_code_provenance(file_path, line)` → returns `ProvenanceRecord[]`
3. For each record, retrieve the prompt text
4. Present: file:line → prompt → session timestamp → commit SHA
5. If no results: fall back to `git log -n 5 -- <file>` and combine with session search

**2.3 `what-happened` skill** — `plugin/skills/what-happened/SKILL.md`

Wraps provenance + observations to investigate why a code block changed.

Trigger: user asks "why did this change", "what broke here", "what session produced this commit".

Workflow:
1. Accept a commit SHA or file:line reference
2. If commit SHA: query `/api/commits` for the matching entry → get prompt + files
3. If file:line: call `get_code_provenance(file_path, line)`
4. Fetch full observation context via `get_observations(ids=[...])`
5. Present: commit diff summary → prompt → observations from that session → decisions made

**Verification — Phase SK-2:**
- Each skill file has valid YAML frontmatter matching `smart-explore/SKILL.md:1-5` pattern
- Trigger phrases match the manymems plugin's trigger detection format
- Manually test each skill by asking the described trigger phrases in a Claude session with the plugin active

---

### Phase SK-3 — Session handoff + session-to-skill

**2.4 `session-handoff` skill** — `plugin/skills/session-handoff/SKILL.md`

Packages current session context so another agent can continue without starting cold.

Trigger: user says "hand this off", "continue in a new session", "save session state", or context limit approaching.

Workflow:
1. Call `observation_context(session_id)` to get current session observations
2. Call `memory_context()` for MEMORY.md state
3. Summarize: current task, in-flight files with line numbers, next steps, open questions
4. Output structured handoff block the next agent can paste as context

**2.5 `session-to-skill` skill** — `plugin/skills/session-to-skill/SKILL.md`

Turns repeated manymems workflows from recent session context into a new plugin skill file.

Trigger: user says "turn this into a skill", "make this repeatable", "I keep doing this workflow".

Workflow:
1. Search recent observations for the repeated workflow pattern
2. Extract: trigger conditions, tool call sequence, output format
3. Draft a new `SKILL.md` following the `plugin/skills/smart-explore/SKILL.md` structure
4. Propose the trigger phrase and workflow steps for user review
5. Write to `plugin/skills/<name>/SKILL.md` after user approves

**Verification — Phase SK-3:**
- `session-handoff` output contains: current task, next steps, session ID for follow-up retrieval
- `session-to-skill` produces a syntactically valid SKILL.md with correct frontmatter
- Both skills trigger on their stated phrases in a live Claude session

---

## TRACK UI — Rebrand + Dark Theme

manymems is not claude-mem. The UI should reflect its own identity: team-intent memory, code provenance, commit-centric history. Design reference: entire.io dashboard — dark/terminal feel, commit rows with SHA chips, clean data tables.

### Phase UI-R1 — Dark theme and color palette

**File to modify:** `src/ui/viewer/viewer-template.html` (CSS block)

**R1.1 Define manymems CSS variables**

Replace the claude-mem color palette with a manymems dark-first palette. Target: deep dark background, amber/gold accent (provenance/intent color), blue-teal for model badges, warm gray for text.

```css
/* manymems dark theme — CSS variables */
:root {
  --mm-bg-primary: #0d0f12;
  --mm-bg-secondary: #13161b;
  --mm-bg-card: #1a1e25;
  --mm-bg-hover: #21262f;
  --mm-border: #2a3040;
  --mm-text-primary: #e6eaf2;
  --mm-text-secondary: #8b95a8;
  --mm-text-muted: #4a5568;
  --mm-accent-amber: #f59e0b;      /* intent / provenance */
  --mm-accent-teal: #2dd4bf;       /* model badges */
  --mm-accent-blue: #60a5fa;       /* links / actions */
  --mm-accent-red: #f87171;        /* errors / warnings */
  --mm-commit-chip-bg: #1e2a1e;
  --mm-commit-chip-text: #4ade80;  /* commit SHAs */
}

[data-theme="light"] {
  --mm-bg-primary: #f8f9fb;
  --mm-bg-secondary: #ffffff;
  --mm-bg-card: #ffffff;
  --mm-bg-hover: #f1f3f7;
  --mm-border: #e2e6ed;
  --mm-text-primary: #1a202c;
  --mm-text-secondary: #4a5568;
  --mm-text-muted: #a0aec0;
  --mm-accent-amber: #d97706;
  --mm-accent-teal: #0d9488;
  --mm-accent-blue: #2563eb;
  --mm-accent-red: #dc2626;
  --mm-commit-chip-bg: #f0fdf4;
  --mm-commit-chip-text: #16a34a;
}
```

**R1.2 Apply variables to base elements**

Replace all hardcoded colors in `viewer-template.html` and the Cartographer's Terminal CSS block to use the new variables.

**Verification — Phase UI-R1:**
- Dark mode shows `--mm-bg-primary: #0d0f12` on body — confirm in browser devtools
- Light mode toggle via ThemeToggle shows `--mm-bg-primary: #f8f9fb`
- No hardcoded hex colors remain in component inline styles (grep: `style=".*#[0-9a-f]`)

---

### Phase UI-R2 — Title, logo, and branding sweep

**Files to modify (sequential, not parallel):**
1. `src/ui/viewer/components/Header.tsx` — change title from "claude-mem" to "manymems"
2. `src/ui/viewer/components/WelcomeCard.tsx` — full rewrite of welcome content
3. `src/ui/viewer/components/GitHubStarsButton.tsx` — point to manymems repo
4. `src/ui/viewer/viewer-template.html` — `<title>` tag + any `claude-mem` strings

**R2.1 Header title**

In `Header.tsx`, change the product name display. The header should show:
- Logo/wordmark: **manymems** in `--mm-accent-amber`
- Tagline: "team memory · code provenance"
- Remove or replace any GitHub stars button pointing at claude-mem

**R2.2 WelcomeCard rewrite**

Replace `WelcomeCard.tsx`'s three feature illustrations and copy with manymems pitch:

| Old (claude-mem) | New (manymems) |
|---|---|
| StreamIllustration — "capture" | PromptIllustration — "every prompt, saved" |
| TuneIllustration — "tune context" | ProvenanceIllustration — "trace code to intent" |
| RecallIllustration — "recall" | CommitIllustration — "search your git history" |

New copy:
- **Every commit tells a story.** manymems captures the prompt, transcript, and decisions behind every code change.
- **Trace code to intent.** Click any file:line to see the session that produced it — not just who changed it, but why.
- **Ask in plain English.** Skills let you search prior work, hand off sessions, and turn repeated workflows into reusable tools.

**R2.3 `<title>` and meta**

In `viewer-template.html`, update `<title>manymems</title>` and any `content="claude-mem"` meta tags.

**Verification — Phase UI-R2:**
- `grep -r "claude-mem" src/ui/viewer/` returns 0 results (aside from internal code comments if any)
- Browser tab shows "manymems"
- WelcomeCard renders the new three-panel feature layout
- `bun run build` succeeds, `tsc --noEmit` clean

---

### Phase UI-R3 — Commit-centric dashboard view (entire.io style)

**New component:** `src/ui/viewer/components/CheckpointFeed.tsx`

This is the central differentiator view: a commit-centric timeline where each row shows:
```
[SHA chip] [date] [author] [model badge] [prompt excerpt]
  └─ [files changed chips, clickable → ProvenanceDrawer]
  └─ [observation count badge]
```

**R3.1 Data hook:** `src/ui/viewer/hooks/useCheckpoints.ts`

Fetches `/api/commits` (added in SK-1). Returns `CheckpointEntry[]` with SSE refresh.

**R3.2 CheckpointFeed component**

Renders the commit-centric list. Style reference: entire.io's commit row layout — compact, dark card, monospace SHA chips in `--mm-commit-chip-text`, file chips in `--mm-accent-amber`.

Each row expands inline to show:
- Full prompt text (truncated at 200 chars, expandable)
- Session observations linked to this commit
- File:line chips clickable → ProvenanceDrawer

**R3.3 Wire into App.tsx + Header nav**

Add a "Checkpoints" tab to `Header.tsx` that switches the main feed to `CheckpointFeed`. This is a sequential edit to `App.tsx` only (never parallel with other App.tsx edits).

**Verification — Phase UI-R3:**
- `/api/commits` returns data; `CheckpointFeed` renders commit rows
- Clicking a file chip opens `ProvenanceDrawer` with the matching provenance entry
- `bun test tests/integration/ --timeout 30000` passes (L3)
- `bun run build` succeeds

---

## TRACK SK-4 — Checkpoint HTTP route (complete SK-1 gap)

> Note: SK-1 adds the route; this phase adds the query to back it.

**File to modify:** `src/services/provenance/store.ts`

Add `getRecentCommits(db, limit)` function that queries `code_provenance GROUP BY commit_sha`, joins `user_prompts` for prompt text, returns sorted `CommitEntry[]`. This keeps the SQL logic out of the route handler (follow the existing pattern in `store.ts:142-168`).

**Verification:**
- Unit test in `tests/provenance/` — mock DB, verify group-by logic
- L1/L2: `bun test tests/provenance/`

---

## Final Phase — Verification & Anti-Pattern Sweep

**F1 — Type check:** `tsc --noEmit` — zero errors after all UI changes

**F2 — Build + restart:**
```bash
npm run build-and-sync
```

**F3 — Branding sweep:**
```bash
grep -r "claude-mem" src/ui/viewer/    # expect 0 results
grep -r "claude-mem" plugin/skills/    # expect 0 results
```

**F4 — Skills smoke test:**
- Install built plugin: `npm run build-and-sync`
- Open a Claude Code session with manymems active
- Say: "search for prior work on provenance" → `search` skill triggers
- Say: "explain src/services/provenance/store.ts:142" → `explain` skill triggers
- Say: "what happened in the last commit" → `what-happened` skill triggers

**F5 — L1+L2 tests:** `bun test tests/provenance/ tests/sqlite/ tests/session_store.test.ts tests/context/`

**F6 — L3 tests:** `bun test tests/integration/ --timeout 30000`

---

## Execution order & dependencies

```
SK-4 (getRecentCommits SQL)
  → SK-1 (HTTP route /api/commits)
    → UI-R3 (CheckpointFeed uses /api/commits)
SK-2 (search/explain/what-happened skills)   [independent of SK-1]
SK-3 (session-handoff/session-to-skill)      [independent of SK-1]
UI-R1 (CSS variables)                        [independent of all above]
  → UI-R2 (branding sweep, uses new vars)
    → UI-R3 (new component uses new vars)
```

Parallel-safe pairs (non-overlapping files):
- `SK-2 + UI-R1` can run simultaneously (skill files vs. CSS)
- `SK-3 + UI-R2` can run simultaneously (skill files vs. UI components)
- **Never:** multiple agents on `App.tsx` simultaneously

---

## Unimplemented from prior sessions (carry-forward)

These items were planned but not shipped as of Jun 5, 2026 (~4am CDT):

| Item | Plan | Status | Notes |
|---|---|---|---|
| Phase A3 — persist provenance records | `plans/00-team-intent-memory-master-plan.md:103` | Half-done, **uncommitted** | `ProvenanceRoutes.ts` has uncommitted changes (git status) |
| Phase B2 — private→team promotion workflow | `00-team-intent-memory-master-plan.md:177` | Pending | Migration 37 not yet written |
| Phase B3 — conflict/dedup/staleness (BullMQ async) | `00-team-intent-memory-master-plan.md:181` | Pending | Migration 38 not yet written |
| Phase B4 — multi-modal capture (MAU pattern) | `00-team-intent-memory-master-plan.md:191` | Pending | |
| Phase B5 — team-scoped retrieval + pgvector | `00-team-intent-memory-master-plan.md:200` | Pending | Migration 39; requires server-beta |
| Phase UI-6 — Teams panel (server-beta only) | `plans/01-ui-multi-model-teams-commits-provenance.md:482` | Pending | Backend routes missing |
| `handleCommits` HTTP route | `ProvenanceRoutes.ts` | **Missing** | Obs 17754-17755 confirm method absent |
| Commit SHA backfill verification | post-commit hook | Partial | Hook installed (obs 17747) but `commit_sha` not backfilled on test rows (obs 17753) |

**Uncommitted changes in working tree** (as of session start):
- `plugin/scripts/worker-service.cjs` — modified
- `src/services/worker/PaginationHelper.ts` — modified (model filter SQL)
- `src/services/worker/http/routes/DataRoutes.ts` — modified (model param extraction)
- `src/services/worker/http/routes/ProvenanceRoutes.ts` — modified (partial A3)

These should be reviewed and either committed or stashed before starting Plan 02.

---

## Known gaps to revisit

- `plugin/plugin.json` — verify skills are registered in the manifest after adding new skill dirs
- `GitHubStarsButton.tsx` — needs real manymems GitHub repo URL once the repo is created
- `WelcomeCard` SVG illustrations — current placeholders use claude-mem icons; new illustrations TBD
- `viewer-template.html` has ~453 lines of Cartographer's Terminal CSS added in UI-5 — reconcile against new `--mm-*` variables to avoid conflicts
