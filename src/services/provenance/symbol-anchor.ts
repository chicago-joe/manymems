import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { parseFile, type CodeSymbol } from '../smart-file-read/parser.js';

export interface SymbolAnchor {
  qualified_name: string;
  kind: string;
  signature_hash: string;
  line_offset_from_symbol_start: number;
}

function sha256(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}

function findInnermostContaining(
  symbols: CodeSymbol[],
  lineStart0: number,
  lineEnd0: number,
  parentName?: string,
): { symbol: CodeSymbol; qualifiedName: string } | null {
  for (const sym of symbols) {
    if (sym.lineStart <= lineStart0 && lineEnd0 <= sym.lineEnd) {
      const qualifiedName = parentName ? `${parentName}.${sym.name}` : sym.name;
      if (sym.children && sym.children.length > 0) {
        const child = findInnermostContaining(sym.children, lineStart0, lineEnd0, qualifiedName);
        if (child) return child;
      }
      return { symbol: sym, qualifiedName };
    }
  }
  return null;
}

export async function buildSymbolAnchor(
  file_path: string,
  line_start: number,
  line_end: number,
): Promise<SymbolAnchor | null> {
  let content: string;
  try {
    content = readFileSync(file_path, 'utf-8');
  } catch {
    return null;
  }

  const foldedFile = parseFile(content, file_path);

  // Convert 1-indexed to 0-indexed for comparison with CodeSymbol.lineStart/lineEnd
  const lineStart0 = line_start - 1;
  const lineEnd0 = line_end - 1;

  const match = findInnermostContaining(foldedFile.symbols, lineStart0, lineEnd0);
  if (!match) return null;

  return {
    qualified_name: match.qualifiedName,
    kind: match.symbol.kind,
    signature_hash: sha256(match.symbol.signature),
    line_offset_from_symbol_start: line_start - (match.symbol.lineStart + 1),
  };
}
