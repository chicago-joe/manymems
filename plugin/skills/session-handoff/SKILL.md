---
name: session-handoff
description: Package current session context so another agent can continue without starting cold. Use when the user says "hand this off", "continue in a new session", "save session state", or context limit is approaching.
---

# Session Handoff

Package the current session state into a structured handoff block so another agent can resume without starting cold.

**Trigger:** user says "hand this off", "continue in a new session", "save session state", or context limit is approaching.

## Workflow

### Step 1: Gather Session Observations

```
mcp__plugin_claude-mem_mcp-search__observation_context(session_id)
```

Retrieve all observations captured in the current session — tool calls, file edits, decisions made.

### Step 2: Gather MEMORY.md State

```
mcp__plugin_claude-mem_mcp-search__memory_context()
```

Pull the current project MEMORY.md so the receiving agent has the same persistent context.

### Step 3: Summarize and Output Handoff Block

Synthesize the gathered context into a structured handoff block:

```
## Handoff Block

### Current Task
<one-sentence description of what is being worked on>

### In-Flight Files
- `path/to/file.ts` — lines <N>-<M>: <what is partially done>
- ...

### Completed This Session
- <bullet per completed step>

### Next Steps
1. <immediate next action>
2. ...

### Open Questions
- <any unresolved ambiguities or decisions pending>

### Relevant Memory
<paste key bullets from MEMORY.md that apply to the current task>
```

Output the handoff block as a fenced code block so the receiving agent can paste it directly as context at the start of a new session.
