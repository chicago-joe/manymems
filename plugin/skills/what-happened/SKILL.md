---
name: what-happened
description: Investigate why a code block changed using provenance and observations. Use when the user asks "why did this change", "what broke here", "what session produced this commit".
---

# What Happened

Investigate why a code block changed using provenance and session observations.

## Workflow

Trigger: user asks "why did this change", "what broke here", "what session produced this commit".

1. Accept a commit SHA or file:line reference
2. If commit SHA: query `GET /api/provenance/commits` (port 37778) for the matching entry → get prompt + files
3. If file:line: call `mcp__plugin_claude-mem_mcp-search__get_code_provenance(file_path, line)`
4. Fetch full observation context via `mcp__plugin_claude-mem_mcp-search__get_observations(ids=[...])`
5. Present: commit diff summary → prompt → observations from that session → decisions made
