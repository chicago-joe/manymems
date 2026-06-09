---
name: session-to-skill
description: Turn a repeated workflow from recent session context into a new plugin skill file. Use when the user says "turn this into a skill", "make this repeatable", "I keep doing this workflow".
---

# Session to Skill

Extract a repeated workflow pattern from recent session observations and draft it as a new plugin skill file.

**Trigger:** user says "turn this into a skill", "make this repeatable", "I keep doing this workflow".

## Workflow

### Step 1: Find the Repeated Pattern

Search recent observations for the workflow the user wants to capture:

```
mcp__plugin_claude-mem_mcp-search__search(query="<workflow description>", limit=20, orderBy="date_desc")
```

Look across multiple recent sessions if the pattern spans them. Identify:
- What consistently triggers the workflow
- Which tools are called, in what order
- What the expected output looks like

### Step 2: Extract Workflow Components

From the search results, pull out:

- **Trigger conditions** — what the user says or what situation prompts this workflow
- **Tool call sequence** — the exact MCP tools or commands called, with parameter patterns
- **Output format** — what the final result looks like (block, file, message, etc.)
- **Edge cases** — any conditional branches observed across instances

### Step 3: Draft the Skill

Draft a new SKILL.md following the `plugin/skills/smart-explore/SKILL.md` structure:

```markdown
---
name: <kebab-case-name>
description: <one-line description ending with trigger phrases>
---

# Title

<What this skill does and when to use it.>

**Trigger:** <exact phrases that invoke it>

## Workflow

### Step 1: ...
...
```

### Step 4: Propose for Review

Present the draft to the user:
- Show the proposed trigger phrase
- Show the complete workflow steps
- Note any gaps where the pattern was ambiguous

Ask: "Does this capture the workflow correctly? Any changes before I write the file?"

### Step 5: Write After Approval

Once the user approves, write the file:

```
plugin/skills/<name>/SKILL.md
```

Confirm the path and frontmatter are valid before writing.
