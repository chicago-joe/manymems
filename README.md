# manymems

**Team memory for multi-session, multi-modal agentic coding agents.**

This project extends [claude-mem](./claude-mem) — a persistent memory plugin for AI coding tools — into a shared memory system for engineering teams. Two capabilities drive the work:

- **Intent → Code Provenance.** Link every developer prompt to the exact lines it changed, anchored by tree-sitter symbols so the link survives later edits. Ask "why was this written?" and get the original intent back.
- **Team multi-session memory.** Let Claude Code, Cursor, Codex, Windsurf, and other agents share a common memory pool with identity, privacy controls, conflict detection, multi-modal capture, and team-scoped retrieval.

---

## Why this project exists

AI coding agents remember nothing across sessions and share nothing across teammates. Each developer rediscovers the same patterns, re-explains the same context, and loses the reasoning behind every change the moment the session ends.

claude-mem solves the single-developer case. manymems solves the team case.

---

## What claude-mem already provides

```
Developer prompt
      │
      ▼
UserPromptSubmit hook
      │  stores prompt_text in user_prompts table
      ▼
PostToolUse hook  ──►  observation handler
      │                      │
      │                      ▼
      │              Claude Agent SDK
      │              (compresses tool events
      │               into structured observations)
      │                      │
      ▼                      ▼
  SQLite ◄──────────  storeObservation()
  (local)              files_modified: [paths]   ← paths only, no line ranges
      │
      ▼
Chroma (vectors)
      │
      ▼
SessionStart hook
  injects relevant past observations
  into the next session's context
```

The team server (Postgres + BullMQ + better-auth, merged in PR #2383) adds multi-user identity, API-key auth, and a horizontally scalable worker. The substrate is sound; the gaps are provenance and team-layer features.

---

## What manymems adds

### Track A — Intent → Code Provenance

```
User types a prompt
      │
      ▼  (UserPromptSubmit)
user_prompts row  ──── prompt_id ────────────────────────┐
                                                          │
      │                                                   │
      ▼  (PostToolUse: Edit / Write)                      │
A1: extract line ranges                                   │
      │  new_string found in file after edit              │
      │  line_start, line_end computed deterministically  │
      ▼                                                   │
A2: build symbol anchor  (tree-sitter)                    │
      │  qualified_name: "AuthService.login"              │
      │  signature_hash: sha256(signature)  ← staleness   │
      ▼                                                   │
A3: code_provenance row ◄─────────────── prompt_id ───────┘
      │  file_path, line_start, line_end
      │  symbol_qualified_name, signature_hash
      │  old_content_hash, new_content_hash
      │  commit_sha  (backfilled by A4)
      ▼
A4: git post-commit hook
      │  fills commit_sha on matching rows
      ▼
A5: get_code_provenance MCP tool
      │  input:  file, line
      │  output: [{prompt_text, symbol, line_range,
      │            commit_sha, stale}]
      ▼
  "why was this written?"  answered
```

**Staleness:** when a query arrives, manymems re-hashes the symbol's current signature. If it differs from the stored `signature_hash`, the record returns `stale: true`.

---

### Track B — Team Multi-Session Memory

```
                    ┌─────────────────────────────────┐
                    │         Agent tools              │
                    │  Claude Code  Cursor  Codex  …  │
                    └──────────────┬──────────────────┘
                                   │  hooks / MCP
                                   ▼
                    ┌─────────────────────────────────┐
                    │   B1: Four-part identity         │
                    │   org_id × actor_id ×            │
                    │   agent_tool_id × session_id     │
                    │   visibility: private|team|org   │
                    └──────────────┬──────────────────┘
                                   │
               ┌───────────────────┼───────────────────┐
               ▼                   ▼                   ▼
        B2: Promotion        B3: Conflict/         B4: Multi-modal
        private → team       Dedup / Staleness     screenshots
        on demand or         (async BullMQ —       voice transcripts
        auto on push         never on write path)  diagrams (MAU)
               └───────────────────┬───────────────────┘
                                   ▼
                    ┌─────────────────────────────────┐
                    │   B5: Team-scoped retrieval      │
                    │   pgvector in Postgres           │
                    │   scope weights: own×1.5         │
                    │     team×1.0  org×0.7            │
                    │   entity-exact > semantic        │
                    │   relevance gate: sim ≥ 0.70     │
                    └──────────────┬──────────────────┘
                                   │
                                   ▼
                    ┌─────────────────────────────────┐
                    │   SessionStart context inject    │
                    │   developer sees own + team      │
                    │   memory, ranked, noise-gated    │
                    └─────────────────────────────────┘
```

---

## Execution order

```
B1 (identity) ──────────────────────────────────► B1.3 (privacy gate)
    │                                                    │
    │                                                    ▼
    ├──► A1 (line ranges) ──► A2 (symbol anchors)       B2 (promotion)
    │           │                     │                  │
    │           └─────────────────────┴──► A3 ──► A4    B3 (conflict)
    │                              (provenance   A5 MCP  │
    │                               table)              B4 (multi-modal)
    │                                                    │
    └────────────────────────────────────────────────── B5 (pgvector)
```

B1 unblocks everything. A1 and A2 run in parallel with B1. A3 converges them. Each phase is independently verifiable and shippable.

---

## Stack

| Layer | Technology |
|---|---|
| Plugin runtime | TypeScript + Bun |
| Local storage | SQLite, Chroma vectors |
| Team server | Postgres, BullMQ, Valkey/Redis |
| Auth | better-auth, SHA-256 API keys |
| Symbol parsing | tree-sitter (20+ language grammars bundled) |
| Agent tools | Claude Code, Cursor, Codex, Windsurf, OpenCode |
| LLM providers | Claude, Gemini, OpenRouter |

---

## Repository layout

```
manymems/
├── claude-mem/          upstream codebase (extended here)
│   ├── src/
│   │   ├── cli/         hook handlers and platform adapters
│   │   ├── services/    worker, SQLite, Chroma, search
│   │   ├── server/      Postgres, BullMQ, auth (server-beta)
│   │   ├── servers/     MCP server (search, provenance tools)
│   │   └── sdk/         Claude Agent SDK prompts and parser
│   └── docs/            architecture and vision documents
└── plans/
    └── 00-team-intent-memory-master-plan.md   phased plan with file:line anchors
```

---

## Key design decisions

**Use tree-sitter symbol names as the primary code anchor, not line numbers.** Line numbers drift on every insertion above the target. A qualified symbol name (`AuthService.login`) survives edits to unrelated functions. The `signature_hash` detects when the symbol itself changes, turning a broken link into a `stale` flag rather than a silent lie.

**Run conflict detection asynchronously.** No system resolves contradictions between observations reliably. manymems links contradicting records and flags them for review; it never auto-resolves.

**Scope-weight retrieval rather than suppress it.** Private observations stay private. Promoted team observations rank at full weight. A relevance gate (similarity ≥ 0.70 for team observations) cuts noise without hiding signal.

---

## Related

- [plans/00-team-intent-memory-master-plan.md](./plans/00-team-intent-memory-master-plan.md) — phased implementation plan with verified `file:line` anchors
- [claude-mem upstream](https://github.com/thedotmack/claude-mem) — the project manymems is built on
- [claude-mem docs](https://docs.claude-mem.ai) — architecture, server setup, API reference

## License & attribution

manymems is open source under the **Apache License 2.0** ([LICENSE](./LICENSE)).

It is built on a snapshot of [claude-mem](https://github.com/thedotmack/claude-mem)
by Alex Newman (Apache-2.0). Original copyright and license notices are preserved in
[NOTICE](./NOTICE) and [LICENSE](./LICENSE). manymems is an independent project; it is
not affiliated with or endorsed by the claude-mem maintainers.
