# manymems — AI Development Instructions

manymems is an Apache-2.0 open-source project built on a snapshot of claude-mem.
It is **not a tracking fork** — no upstream sync, no contributing back.
See `.claude/session-context.md` for full project context and
`plans/00-team-intent-memory-master-plan.md` for the implementation plan.

## Build

```bash
npm run build                 # Build only — safe, never touches the running plugin
```

**NEVER run `npm run build-and-sync` during development.**

`sync-marketplace.cjs` rsyncs the **entire manymems project** (with `--delete`) into
`~/.claude/plugins/marketplaces/thedotmack/` — which is the stock claude-mem git repo.
This overwrites its scripts, deletes its workflows, and corrupts port 37777.
Recovery: `git restore . && git clean -fd` in the thedotmack directory, then restart the worker.

## Port Boundary — DO NOT CROSS

| Port | Process | Owner | Rule |
|------|---------|-------|------|
| **37777** | Stock claude-mem plugin | `~/.claude/plugins/marketplaces/thedotmack/` | **OFF LIMITS** — never run build-and-sync |
| **37778** | manymems dev worker | `/tmp/manymems-e2e-home` (tests) or `~/.claude-mem` (live DB) | OK for development |

## Running the manymems dev worker (Option A)

To run manymems alongside the stock claude-mem at 37777, start it manually on 37778:

```bash
export PATH="$PATH:/home/chicagojoe/.bun/bin"

# Against the live DB (same data as 37777, useful for UI dev):
CLAUDE_MEM_DATA_DIR=~/.claude-mem \
CLAUDE_MEM_WORKER_PORT=37778 \
CLAUDE_MEM_WORKER_HOST=127.0.0.1 \
CLAUDE_MEM_CHROMA_ENABLED=false \
CLAUDE_MEM_LOG_LEVEL=warn \
  bun /home/chicagojoe/PyCharmProjects/manymems/plugin/scripts/worker-service.cjs --daemon

# Against the isolated test DB (safe for destructive tests):
mkdir -p /tmp/manymems-e2e-home
echo '{"CLAUDE_MEM_WORKER_PORT":"37778","CLAUDE_MEM_WORKER_HOST":"127.0.0.1","CLAUDE_MEM_CHROMA_ENABLED":"false","CLAUDE_MEM_LOG_LEVEL":"warn","CLAUDE_MEM_DATA_DIR":"/tmp/manymems-e2e-home"}' \
  > /tmp/manymems-e2e-home/settings.json
CLAUDE_MEM_DATA_DIR=/tmp/manymems-e2e-home \
  bun /home/chicagojoe/PyCharmProjects/manymems/plugin/scripts/worker-service.cjs --daemon

# Poll until ready:
until curl -sf http://127.0.0.1:37778/api/health | grep -q '"initialized":true'; do sleep 1; done
```

## File Locations

- **Source**: `<project-root>/src/`
- **Built Plugin**: `<project-root>/plugin/`
- **Database**: `~/.claude-mem/claude-mem.db`
- **Chroma**: `~/.claude-mem/chroma/`

## manymems-specific gotchas

**bun not on PATH** — always prefix: `export PATH="$PATH:/home/chicagojoe/.bun/bin"`

**Two SQLite migration chains** — every new migration MUST be added to BOTH:
- `src/services/sqlite/SessionStore.ts` (inline constructor chain — used by `:memory:` tests + ContextBuilder)
- `src/services/sqlite/migrations/runner.ts` (used by the real worker via `Database.ts`)

Missing from either chain means `:memory:` tests pass while the live worker breaks (or vice versa).
Assigned migration numbers: B2=37, B3=38, B4=39.

**tree-sitter parse = CLI subprocess (~2.4s first call, <1ms cached)**
Content-addressed cache lives in `src/services/smart-file-read/parser.ts` (512-entry FIFO).
Symbol anchoring runs fire-and-forget worker-side — never on the capture hot path.
Tests that call `buildSymbolAnchor` need `, 30000` timeout argument.
Fresh worktrees need `bun install && bun pm trust tree-sitter` or grammars silently fail (0 symbols, tests skip via null-check and pass falsely).

**New HTTP routes must forward fields end-to-end** — verify the route handler destructures
all new fields from `req.body` and passes them to the service layer. L2 `:memory:` tests
bypass the route entirely; L3 live integration (`tests/integration/`) is required to catch
missing forwarding. (Example: `editChanges` was in the Zod schema but never destructured
in `SessionRoutes.ts` until caught by L3 — `4e5df8b`.)

**Start an isolated test worker** (port 37778; installed claude-mem uses 37777):
```bash
mkdir -p /tmp/manymems-e2e-home
echo '{"CLAUDE_MEM_WORKER_PORT":"37778","CLAUDE_MEM_WORKER_HOST":"127.0.0.1","CLAUDE_MEM_CHROMA_ENABLED":"false","CLAUDE_MEM_LOG_LEVEL":"warn","CLAUDE_MEM_DATA_DIR":"/tmp/manymems-e2e-home"}' \
  > /tmp/manymems-e2e-home/settings.json
CLAUDE_MEM_DATA_DIR=/tmp/manymems-e2e-home bun plugin/scripts/worker-service.cjs --daemon
# poll until ready:
until curl -sf http://127.0.0.1:37778/api/health | grep -q '"initialized":true'; do sleep 1; done
```

## Testing

```bash
bun test tests/provenance/ tests/sqlite/ tests/session_store.test.ts tests/context/  # L1/L2
bun test tests/integration/ --timeout 30000   # L3 (requires test worker on :37778)
bash scripts/e2e-server-beta-docker.sh         # L4 Docker (~5 min)
```

Testing contract per phase:
- **L1+L2** `:memory:` round-trip — mandatory every phase
- **L3** live worker — mandatory for any new or changed HTTP route
- **L4** Docker — mandatory for B3 async jobs and B5 pgvector

## Requirements

- **Bun** (all platforms - auto-installed if missing)
- **uv** (all platforms - auto-installed if missing, provides Python for Chroma)
- Node.js

## Documentation

**Public Docs**: https://docs.claude-mem.ai (Mintlify)
**Source**: `docs/public/` - MDX files, edit `docs.json` for navigation
**Deploy**: Auto-deploys from GitHub on push to main

## Important

No need to edit the changelog ever, it's generated automatically.

## Exploration Guardrails (enforced — do not bypass)

**NEVER use Bash or Read for code exploration.** Always use smart tools first:
- Find files/symbols → `smart_search(query, path)` (replaces Glob + grep + Read chains)
- File structure → `smart_outline(file_path)` → `smart_unfold(file, symbol)` for bodies
- Past session context → `/mem-search` → `search()` → `get_observations(ids)`
- Feature mapping → `/pathfinder` skill before any fan-out
- Bash: run commands only (tests, build, git). Never `cat`/`head`/`grep`/`find` on source files.
- Read: only after smart tools are insufficient, or for non-code files (JSON config, markdown)

**Parallel agents on the same file = race condition.**
- Assign each agent non-overlapping files — `App.tsx`, `Header.tsx`, `Feed.tsx` are high-contention
- Never run >1 agent touching `App.tsx` simultaneously; do UI wiring in a single sequential pass
- Use `isolation: 'worktree'` in the Agent tool when agents must touch overlapping files

**UI data shapes (src/ui/viewer):**
- `observation.files_modified` and `observation.files_read` are JSON-encoded array strings — always `JSON.parse()`, never split on comma

## Daily Maintenance

Run a daily version check across all package manifests and upgrade every dependency to its latest version — including major version bumps. Staying on the latest is the goal; do not skip majors.

- Check `package.json` (root) and all nested `package.json` files (e.g. `plugin/`, `openclaw/`) for outdated dependencies via `npm outdated`.
- Upgrade every package to `latest` (use `npm install <pkg>@latest` for each, or `npx npm-check-updates -u && npm install`). Bump majors too.
- Run `npm audit fix` to resolve advisories.
- After upgrades, run `npm run build-and-sync` and verify the worker starts and tests pass. Fix any breakage caused by major bumps in the same change.
- Commit the updated `package.json` and `package-lock.json` files.
