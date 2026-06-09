---
name: explain
description: Trace a function, file, or line back to the prompt and session that produced it using get_code_provenance. Use when the user asks "why does this function exist", "who wrote this", "what was the reasoning behind X", or pastes a file:line reference.
---

# Explain

Trace code back to the prompt and session that produced it using provenance tools.

## Workflow

Trigger: user asks "why does this function exist", "who wrote this", "what was the reasoning behind X", or pastes a file:line reference.

1. Parse file path + line number from user's message
2. Call `mcp__plugin_claude-mem_mcp-search__get_code_provenance(file_path, line)` → returns ProvenanceRecord[]
3. For each record, retrieve the prompt text
4. Present: file:line → prompt → session timestamp → commit SHA
5. If no results: fall back to `git log -n 5 -- <file>` and combine with session search
