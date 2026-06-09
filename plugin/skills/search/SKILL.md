---
name: search
description: Search past work across sessions using manymems MCP tools. Use when the user asks about prior work, earlier prompts, similar implementations, or "what did we do about X".
---

# Search

Search past work and sessions using manymems memory tools.

## Workflow

Trigger: user asks about prior work, earlier prompts, similar implementations, or "what did we do about X".

1. Call `mcp__plugin_claude-mem_mcp-search__search(query, project, limit=20, orderBy="date_desc")`
2. If thin (<3 results), broaden: `mcp__plugin_claude-mem_mcp-search__observation_search(query, limit=50)`
3. Call `mcp__plugin_claude-mem_mcp-search__get_observations(ids=[...])` for the top hits
4. Synthesize: summarize findings in 3–5 bullets with session timestamps
