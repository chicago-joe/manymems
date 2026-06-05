import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { join } from 'node:path';

// A4: git post-commit hook. On each commit it collects the changed files (as
// absolute paths so they match the absolute file_path stored in
// code_provenance) and the previous commit's epoch, then POSTs to the worker so
// commit_sha is backfilled onto the provenance rows produced since that commit.
// Idempotent: skips silently if the worker is down (provenance is additive).
const HOOK_MARKER = '# >>> claude-mem provenance link-commit >>>';

export function buildPostCommitHook(workerPort: number): string {
  return `#!/usr/bin/env bash
${HOOK_MARKER}
# Installed by claude-mem (A4 intent->code provenance). Safe to remove this block.
set -euo pipefail
CLAUDE_MEM_PORT="\${CLAUDE_MEM_WORKER_PORT:-${workerPort}}"
ROOT="$(git rev-parse --show-toplevel)"
SHA="$(git rev-parse HEAD)"
# Epoch of the previous commit (0 for the very first commit).
PREV_EPOCH="$(git log -1 --format=%ct HEAD~1 2>/dev/null || echo 0)"
PREV_MS=$(( PREV_EPOCH * 1000 ))
# Changed files as absolute paths, JSON-encoded.
FILES_JSON="$(git diff-tree --no-commit-id -r --name-only HEAD \\
  | while IFS= read -r f; do [ -n "$f" ] && printf '%s\\n' "$ROOT/$f"; done \\
  | python3 -c 'import sys, json; print(json.dumps([l.strip() for l in sys.stdin if l.strip()]))' 2>/dev/null || echo '[]')"
[ "$FILES_JSON" = "[]" ] && exit 0
curl -s -m 3 -X POST "http://127.0.0.1:\${CLAUDE_MEM_PORT}/api/provenance/link-commit" \\
  -H 'Content-Type: application/json' \\
  -d "{\\"commit_sha\\":\\"$SHA\\",\\"since_epoch\\":$PREV_MS,\\"changed_files\\":$FILES_JSON}" \\
  >/dev/null 2>&1 || true
${HOOK_MARKER.replace('>>>', '<<<')}
`;
}

export interface InstallHookResult {
  installed: boolean;
  path: string;
  reason?: string;
}

// Installs (or refreshes) the post-commit hook in a repo's .git/hooks. If a
// hook already exists and is not ours, we refuse rather than clobber it.
export function installPostCommitHook(repoRoot: string, workerPort: number): InstallHookResult {
  const hooksDir = join(repoRoot, '.git', 'hooks');
  const hookPath = join(hooksDir, 'post-commit');
  const body = buildPostCommitHook(workerPort);

  if (existsSync(hookPath)) {
    const existing = readFileSync(hookPath, 'utf-8');
    if (!existing.includes(HOOK_MARKER)) {
      return { installed: false, path: hookPath, reason: 'foreign_hook_present' };
    }
  }
  if (!existsSync(hooksDir)) mkdirSync(hooksDir, { recursive: true });
  writeFileSync(hookPath, body, 'utf-8');
  chmodSync(hookPath, 0o755);
  return { installed: true, path: hookPath };
}
