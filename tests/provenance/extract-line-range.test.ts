import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { extractEditChanges } from '../../src/services/provenance/extract-line-range.js';

function sha256(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdirSync(join(tmpdir(), `prov-test-${Date.now()}`), { recursive: true }) as unknown as string
    ?? join(tmpdir(), `prov-test-${Date.now()}`);
  // mkdirSync with recursive returns string|undefined, get the path directly
  tmpDir = join(tmpdir(), `prov-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(tmpDir, { recursive: true });
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('extractEditChanges — Edit tool', () => {
  it('returns correct line_start/line_end for a single-line replacement', async () => {
    const file = join(tmpDir, 'a.ts');
    writeFileSync(file, 'line1\nline2\nline3\n');
    // Simulate: old_string was "line2", new_string is "line2_edited"
    writeFileSync(file, 'line1\nline2_edited\nline3\n');

    const changes = await extractEditChanges('Edit', {
      file_path: file,
      old_string: 'line2',
      new_string: 'line2_edited',
    });

    expect(changes).toHaveLength(1);
    expect(changes[0].line_start).toBe(2);
    expect(changes[0].line_end).toBe(2);
    expect(changes[0].tool_name).toBe('Edit');
    expect(changes[0].old_content_hash).toBe(sha256('line2'));
    expect(changes[0].new_content_hash).toBe(sha256('line2_edited'));
  });

  it('returns correct line range for a multi-line new_string', async () => {
    const file = join(tmpDir, 'b.ts');
    // new_string spans lines 2-3
    writeFileSync(file, 'line1\nfoo\nbar\nline4\n');

    const changes = await extractEditChanges('Edit', {
      file_path: file,
      old_string: 'old',
      new_string: 'foo\nbar',
    });

    expect(changes).toHaveLength(1);
    expect(changes[0].line_start).toBe(2);
    expect(changes[0].line_end).toBe(3);
  });

  it('returns all ranges when replace_all=true', async () => {
    const file = join(tmpDir, 'c.ts');
    writeFileSync(file, 'x\nx\nx\n');

    const changes = await extractEditChanges('Edit', {
      file_path: file,
      old_string: 'old',
      new_string: 'x',
      replace_all: true,
    });

    expect(changes).toHaveLength(3);
    expect(changes[0].line_start).toBe(1);
    expect(changes[1].line_start).toBe(2);
    expect(changes[2].line_start).toBe(3);
    for (const c of changes) {
      expect(c.tool_name).toBe('Edit');
    }
  });

  it('returns empty array when new_string not found', async () => {
    const file = join(tmpDir, 'd.ts');
    writeFileSync(file, 'hello world\n');

    const changes = await extractEditChanges('Edit', {
      file_path: file,
      old_string: 'hello',
      new_string: 'not_present_xyz',
    });

    expect(changes).toHaveLength(0);
  });
});

describe('extractEditChanges — Write tool', () => {
  it('returns range covering the entire file', async () => {
    const file = join(tmpDir, 'e.ts');
    const content = 'line1\nline2\nline3\n';
    writeFileSync(file, content);

    const changes = await extractEditChanges('Write', {
      file_path: file,
      content,
    });

    expect(changes).toHaveLength(1);
    expect(changes[0].line_start).toBe(1);
    expect(changes[0].line_end).toBe(4); // 3 newlines → 4 parts
    expect(changes[0].tool_name).toBe('Write');
    expect(changes[0].old_content_hash).toBe(sha256(''));
    expect(changes[0].new_content_hash).toBe(sha256(content));
  });

  it('handles a single-line file', async () => {
    const file = join(tmpDir, 'f.ts');
    const content = 'only one line';
    writeFileSync(file, content);

    const changes = await extractEditChanges('Write', {
      file_path: file,
      content,
    });

    expect(changes[0].line_start).toBe(1);
    expect(changes[0].line_end).toBe(1);
  });
});

describe('extractEditChanges — MultiEdit tool', () => {
  it('returns one change per edit in the edits array', async () => {
    const file = join(tmpDir, 'g.ts');
    writeFileSync(file, 'alpha\nbeta\ngamma\n');

    const changes = await extractEditChanges('MultiEdit', {
      file_path: file,
      edits: [
        { old_string: 'a', new_string: 'alpha' },
        { old_string: 'b', new_string: 'beta' },
      ],
    });

    expect(changes).toHaveLength(2);
    expect(changes[0].line_start).toBe(1);
    expect(changes[1].line_start).toBe(2);
    expect(changes[0].tool_name).toBe('MultiEdit');
  });

  it('expands replace_all edits to multiple ranges', async () => {
    const file = join(tmpDir, 'h.ts');
    writeFileSync(file, 'z\nz\nz\n');

    const changes = await extractEditChanges('MultiEdit', {
      file_path: file,
      edits: [
        { old_string: 'old', new_string: 'z', replace_all: true },
      ],
    });

    expect(changes).toHaveLength(3);
  });
});

describe('extractEditChanges — unknown tool', () => {
  it('returns empty array for unrecognized tool names', async () => {
    const changes = await extractEditChanges('Read', { file_path: '/any' });
    expect(changes).toHaveLength(0);
  });
});
