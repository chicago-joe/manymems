# Plan 04 — Docs Compliance Audit & UI Smoke Test

Ensure manymems follows the guidelines, anti-patterns, best practices, workflows, and
learnings from docs.claude-mem.ai. Then run/test manymems and pause for user to use the UI.

## Documentation Sources (scraped 2026-06-09)

| Doc | Key Principle |
|-----|--------------|
| [Context Engineering](https://docs.claude-mem.ai/context-engineering) | Smallest high-signal token set; just-in-time context; tools minimal & clear |
| [Progressive Disclosure](https://docs.claude-mem.ai/progressive-disclosure) | 3-layer workflow; show token costs; agent decides what to fetch |
| [File Read Gate](https://docs.claude-mem.ai/file-read-gate) | PreToolUse hook on Read; 4-option decision tree; 1,500-byte bypass; timestamp |
| [Smart Explore Benchmark](https://docs.claude-mem.ai/smart-explore-benchmark) | smart_search 17.8x cheaper; smart_unfold never truncates; escalate only for synthesis |
| [Search Tools](https://docs.claude-mem.ai/usage/search-tools) | search/timeline/get_observations/__IMPORTANT; always batch IDs; filter before fetch |

## Allowed APIs (from docs)

### MCP Search Tools (4 tools, canonical signatures)
```
search(query, limit=20, offset?, type?, obs_type?, project?, dateStart?, dateEnd?, orderBy?)
timeline(anchor?, query?, depth_before=3, depth_after=3, project?)
get_observations(ids[], orderBy?, limit?, project?)
__IMPORTANT  — auto-shown, no invocation needed
```

### Smart Explore Tools (3 tools, canonical token costs)
```
smart_search(query, path?)       → ~2,000–6,000 tokens
smart_outline(file_path)         → ~1,000–2,000 tokens
smart_unfold(file_path, symbol)  → ~400–2,100 tokens
```

### Progressive Disclosure Index Format
```
### Date
| ID | Time | T | Title | Tokens |
```
Legend icons: 🎯🔴🟡🔵🟢🟣🟠🟤⚖️

### File Read Gate Decision Tree (cheapest to most expensive)
1. Semantic priming — 0 extra tokens
2. get_observations([IDs]) — ~300 each
3. smart_outline / smart_unfold — ~1–2k
4. Full file read — 5k–50k

## Anti-Patterns to Guard Against

- ❌ Cramming all context into system prompt upfront
- ❌ Tools with overlapping purposes or ambiguous decision points
- ❌ Verbose observation titles (>15 words)
- ❌ Hiding token retrieval costs from agent
- ❌ Skipping the index layer (fetching full observations without searching first)
- ❌ No retrieval path instructions in index header
- ❌ File Read Gate missing timestamp for temporal reasoning
- ❌ Using Explore Agent when smart_search + smart_unfold would suffice
- ❌ Making separate get_observations calls per ID (should always batch)
- ❌ Bash/Read for code exploration instead of smart tools

## Phase 0: Documentation Discovery (DONE — pre-work)

All 5 docs scraped by orchestrator. Findings consolidated above. ✅

---

## Phase 1: Parallel Audit (4 Subagents — Sonnet)

Deploy 4 independent Sonnet subagents in parallel. Each audits one compliance area.
Each must report: files checked, exact findings, line numbers, verdict (PASS/FAIL/PARTIAL).

### A1 — Context Engineering & MCP Tool Audit

**Files to inspect:**
- `plugin/scripts/mcp-server.cjs` — tool descriptions, schema, param names
- `src/ui/viewer/utils/api.ts` — API_ENDPOINTS shape
- `plugin/skills/*/SKILL.md` — skill tool guidance sections

**Check for:**
1. Each MCP tool has a single, clear purpose (no overlap between `search`/`observation_search`)
2. Tool parameter names are unambiguous (`user_id` style, not `user`)
3. Tool descriptions tell the agent *exactly* when to use each tool
4. No bloated tool sets (tools that cover too much functionality)
5. manymems-added tools (`get_code_provenance`, `smart_search`, `smart_outline`, `smart_unfold`) follow minimal/clear design
6. SKILL.md files guide toward just-in-time context (not pre-loading everything)

**Verdict criteria:** PASS = all tools have unambiguous single purpose; FAIL = any overlapping/ambiguous tools

### A2 — Progressive Disclosure Compliance Audit

**Files to inspect:**
- `src/hooks/context-hook.ts` (or wherever SessionStart hook renders the index)
- Any file producing the `### Date | ID | Time | T | Title | Tokens |` table
- `plugin/hooks/hooks.json` — hook definitions

**Check for:**
1. SessionStart provides a compact index (not full observation dumps)
2. Index table includes token cost column (`| ~155 |` style)
3. Legend system present (🎯🔴🟡🔵🟢🟣🟠🟤⚖️) with key
4. Progressive disclosure instructions included in header ("Use MCP search tools to fetch on-demand")
5. Critical types (🔴 gotcha, 🟤 decision, ⚖️ trade-off) highlighted
6. Grouping by file path present
7. Anti-pattern violations: verbose titles (>15 words), no retrieval path, skipping index layer

**Verdict criteria:** PASS = all 7 checks pass; PARTIAL = 5-6 pass; FAIL = <5 pass

### A3 — File Read Gate Audit

**Files to inspect:**
- `src/cli/handlers/file-context.ts` — main gate implementation (or equivalent in manymems)
- `plugin/hooks/hooks.json` — hooks config for Read tool PreToolUse
- Search for: `by-file`, `file_read_gate`, `file-read-gate`, `PreToolUse`, `Read` matcher

**Check for:**
1. PreToolUse hook on `Read` tool exists and is active in hooks.json
2. Gate checks `/api/observations/by-file` (or equivalent route)
3. Current date/time injected at top of timeline message (`Current: YYYY-MM-DD h:mmpm TZ`)
4. 4-option decision tree present in gate message (semantic priming → get_obs → smart tools → full read)
5. Small-file bypass implemented at ≤ 1,500 bytes
6. Specificity ranking: modified files score +2, <3 files +2, 4-8 files +1, 9+ files +0
7. Limit of 15 deduplicated observations (1 per session)

**Verdict criteria:** PASS = all 7; PARTIAL = 5-6; FAIL = <5

### A4 — Smart Explore & Search Tools Audit

**Files to inspect:**
- `plugin/scripts/mcp-server.cjs` — smart_search, smart_outline, smart_unfold tool schemas
- `src/services/smart-file-read/` — smart tool implementation
- `plugin/skills/*/SKILL.md` — do skills recommend smart tools over Explore Agent?
- `CLAUDE.md` (project root) — exploration guardrails section

**Check for:**
1. All 3 Smart Explore tools present: `smart_search`, `smart_outline`, `smart_unfold`
2. Token cost ranges documented in tool descriptions (search: 2-6k, outline: 1-2k, unfold: 400-2.1k)
3. Tool descriptions specify: "use when you know what you're looking for" vs. Explore Agent for synthesis
4. `get_observations` always called with array of IDs (never single-ID per call per docs)
5. `search` tool supports all documented params: query, limit, offset, type, obs_type, project, dateStart, dateEnd, orderBy
6. `timeline` supports both `anchor` and `query` modes
7. CLAUDE.md guardrails forbid Bash/Read for exploration (smart tools first)

**Verdict criteria:** PASS = all 7; PARTIAL = 5-6; FAIL = <5

---

## Phase 2: Synthesize + Fix (Sequential — Orchestrator)

After Phase 1 subagents return, orchestrator:
1. Collects all FAIL/PARTIAL verdicts
2. Prioritizes by severity (FAIL > PARTIAL, then by user-impact)
3. Implements fixes for each, one file at a time
4. Re-runs `bun tsc --noEmit` after each TypeScript file changed

**Expected fixes (pre-identified gaps):**
- F1: File Read Gate timestamp line — verify/add `Current: YYYY-MM-DD h:mmpm TZ` to gate message
- F2: Progressive Disclosure — verify token cost column (`~N`) present in all index rows
- F3: Search tool params — verify `obs_type`, `dateStart`, `dateEnd` exposed in MCP schema
- F4: Skill files — verify they recommend `search → get_observations` pattern (not pre-loading)

**Verification after each fix:**
```bash
bun tsc --noEmit   # TypeScript clean
npm run build      # Build passes (never build-and-sync)
```

---

## Phase 3: Build + Test

After all fixes landed:

```bash
# 1. Build
npm run build

# 2. Start isolated test worker (37778)
mkdir -p /tmp/manymems-e2e-home
echo '{"CLAUDE_MEM_WORKER_PORT":"37778","CLAUDE_MEM_WORKER_HOST":"127.0.0.1","CLAUDE_MEM_CHROMA_ENABLED":"false","CLAUDE_MEM_LOG_LEVEL":"warn","CLAUDE_MEM_DATA_DIR":"/tmp/manymems-e2e-home"}' \
  > /tmp/manymems-e2e-home/settings.json
CLAUDE_MEM_DATA_DIR=/tmp/manymems-e2e-home \
  bun plugin/scripts/worker-service.cjs --daemon
until curl -sf http://127.0.0.1:37778/api/health | grep -q '"initialized":true'; do sleep 1; done

# 3. L1/L2 tests
bun test tests/provenance/ tests/sqlite/ tests/session_store.test.ts tests/context/

# 4. L3 integration tests
bun test tests/integration/ --timeout 30000

# 5. Type check
bun tsc --noEmit
```

**Pass criteria:** L1/L2 ≥ 196/196, L3 ≥ 61/61, TypeScript 0 errors

---

## Phase 4: Start manymems UI + Pause for User

```bash
export PATH="$PATH:/home/chicagojoe/.bun/bin"

# Stop test worker, start against live DB
CLAUDE_MEM_DATA_DIR=~/.claude-mem \
CLAUDE_MEM_WORKER_PORT=37778 \
CLAUDE_MEM_WORKER_HOST=127.0.0.1 \
CLAUDE_MEM_CHROMA_ENABLED=false \
CLAUDE_MEM_LOG_LEVEL=warn \
  bun /home/chicagojoe/PyCharmProjects/manymems/plugin/scripts/worker-service.cjs --daemon

until curl -sf http://127.0.0.1:37778/api/health | grep -q '"initialized":true'; do sleep 1; done
```

Serve UI: `http://127.0.0.1:37778/` (viewer is served from the worker).

**Then PAUSE.** Print to user:
```
manymems UI is live at http://127.0.0.1:37778/
Open in your browser and interact with it. Tell me when you're done or have feedback.
```

Wait for user message before proceeding.

---

## Commit Message Template

```
audit(plan04): docs compliance — context-eng, progressive-disclosure, file-read-gate, smart-explore

Verified manymems follows guidelines from docs.claude-mem.ai best practices.
Fixed: [list from Phase 2]
L1/L2: 196/196 | L3: 61/61 | tsc: 0 errors

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
```

---

## Anti-Pattern Guards

```bash
# Ensure no build-and-sync references in plans
grep -r "build-and-sync" plans/ && echo "FAIL: found build-and-sync in plans" || echo "OK"

# Ensure no port 37777 in curl/test commands
grep -r "37777" plans/ scripts/ && echo "WARN: check 37777 references" || echo "OK"

# Ensure smart tools used (not Bash grep for source exploration)
grep -r "Bash.*grep.*src/" plans/ && echo "WARN: Bash grep on src in plans" || echo "OK"
```
