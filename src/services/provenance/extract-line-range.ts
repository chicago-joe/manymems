import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import type { SymbolAnchor } from './symbol-anchor.js';

export interface EditChange {
  file_path: string;
  line_start: number;       // 1-indexed
  line_end: number;
  old_content_hash: string; // sha256 hex of old_string
  new_content_hash: string; // sha256 hex of new_string
  tool_name: 'Edit' | 'Write' | 'MultiEdit';
  symbol_anchor?: SymbolAnchor | null;
}

function sha256(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}

function posToLineRange(content: string, startPos: number, str: string): { line_start: number; line_end: number } {
  const before = content.slice(0, startPos);
  const line_start = before.split('\n').length;
  const line_end = line_start + str.split('\n').length - 1;
  return { line_start, line_end };
}

function findAllPositions(content: string, searchStr: string): number[] {
  const positions: number[] = [];
  let pos = 0;
  while (true) {
    const idx = content.indexOf(searchStr, pos);
    if (idx === -1) break;
    positions.push(idx);
    pos = idx + 1;
  }
  return positions;
}

export async function extractEditChanges(
  toolName: string,
  toolInput: Record<string, unknown>,
): Promise<EditChange[]> {
  if (toolName === 'Write') {
    const filePath = toolInput.file_path as string;
    const newContent = (toolInput.content as string) ?? '';
    let content: string;
    try {
      content = readFileSync(filePath, 'utf-8');
    } catch {
      content = newContent;
    }
    return [{
      file_path: filePath,
      line_start: 1,
      line_end: content.split('\n').length,
      old_content_hash: sha256(''),
      new_content_hash: sha256(newContent),
      tool_name: 'Write',
    }];
  }

  if (toolName === 'Edit') {
    const filePath = toolInput.file_path as string;
    const oldString = (toolInput.old_string as string) ?? '';
    const newString = (toolInput.new_string as string) ?? '';
    const replaceAll = (toolInput.replace_all as boolean) ?? false;

    let content: string;
    try {
      content = readFileSync(filePath, 'utf-8');
    } catch {
      return [];
    }

    const oldHash = sha256(oldString);
    const newHash = sha256(newString);

    if (replaceAll) {
      return findAllPositions(content, newString).map(pos => ({
        file_path: filePath,
        ...posToLineRange(content, pos, newString),
        old_content_hash: oldHash,
        new_content_hash: newHash,
        tool_name: 'Edit' as const,
      }));
    }

    const idx = content.indexOf(newString);
    if (idx === -1) return [];
    return [{
      file_path: filePath,
      ...posToLineRange(content, idx, newString),
      old_content_hash: oldHash,
      new_content_hash: newHash,
      tool_name: 'Edit',
    }];
  }

  if (toolName === 'MultiEdit') {
    const filePath = toolInput.file_path as string;
    const edits = (toolInput.edits as Array<{ old_string: string; new_string: string; replace_all?: boolean }>) ?? [];

    let content: string;
    try {
      content = readFileSync(filePath, 'utf-8');
    } catch {
      return [];
    }

    const changes: EditChange[] = [];
    for (const edit of edits) {
      const oldString = edit.old_string ?? '';
      const newString = edit.new_string ?? '';
      const oldHash = sha256(oldString);
      const newHash = sha256(newString);

      if (edit.replace_all) {
        for (const pos of findAllPositions(content, newString)) {
          changes.push({
            file_path: filePath,
            ...posToLineRange(content, pos, newString),
            old_content_hash: oldHash,
            new_content_hash: newHash,
            tool_name: 'MultiEdit',
          });
        }
      } else {
        const idx = content.indexOf(newString);
        if (idx !== -1) {
          changes.push({
            file_path: filePath,
            ...posToLineRange(content, idx, newString),
            old_content_hash: oldHash,
            new_content_hash: newHash,
            tool_name: 'MultiEdit',
          });
        }
      }
    }
    return changes;
  }

  return [];
}
