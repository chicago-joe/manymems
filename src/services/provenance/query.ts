import { buildSymbolAnchor } from './symbol-anchor.js';
import type { SessionStore } from '../sqlite/SessionStore.js';
import type { ProvenanceRecord } from './store.js';
import { logger } from '../../utils/logger.js';

// Off-hot-path symbol resolution. The capture hook stores only line ranges +
// hashes (cheap). This runs afterwards (fire-and-forget in the worker) to
// resolve each row's tree-sitter symbol anchor and persist the signature-hash
// baseline used for staleness. Tree-sitter parsing is ~seconds/file, so it must
// never run on the edit hook path. Sequential + best-effort: failures are
// logged, never thrown.
export async function resolveProvenanceSymbols(
  store: SessionStore,
  records: Array<{ id: string; file_path: string; line_start: number; line_end: number }>,
): Promise<number> {
  let resolved = 0;
  for (const r of records) {
    try {
      const anchor = await buildSymbolAnchor(r.file_path, r.line_start, r.line_end);
      if (anchor) {
        store.updateProvenanceSymbol(r.id, anchor);
        resolved++;
      }
    } catch (err) {
      logger.debug('INGEST', 'Symbol resolution failed (non-fatal)', {
        file: r.file_path,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return resolved;
}

export interface ProvenanceChange {
  session_id: string | null;
  occurred_at: number;
  prompt_text?: string | null;
  symbol: string | null;
  line_start: number;
  line_end: number;
  commit_sha: string | null;
  stale: boolean;
}

export interface CodeProvenanceResult {
  file: string;
  line: number;
  resolved_by: 'symbol' | 'line';
  symbol?: string | null;
  changes: ProvenanceChange[];
}

// A5: the "why was this written" query. Resolves provenance for a file:line.
// Primary path: re-parse the current file with tree-sitter; if `line` falls in
// a known symbol, query by qualified name (survives line drift) and flag rows
// whose stored signature_hash differs from the symbol's current signature
// (stale = the code changed since the intent was recorded). Fallback: when no
// symbol contains the line, query by line-range overlap.
export async function getCodeProvenance(
  store: SessionStore,
  file: string,
  line: number,
  includePrompt = true,
): Promise<CodeProvenanceResult> {
  const anchor = await buildSymbolAnchor(file, line, line);

  let rows: ProvenanceRecord[];
  let resolvedBy: 'symbol' | 'line';
  let currentSignatureHash: string | null = null;

  if (anchor) {
    rows = store.getProvenanceBySymbol(file, anchor.qualified_name);
    resolvedBy = 'symbol';
    currentSignatureHash = anchor.signature_hash;
    // If the symbol exists but has no recorded provenance, fall back to line
    // overlap so a caller still gets any row covering the line.
    if (rows.length === 0) {
      rows = store.getProvenanceByLine(file, line);
      resolvedBy = 'line';
    }
  } else {
    rows = store.getProvenanceByLine(file, line);
    resolvedBy = 'line';
  }

  const changes: ProvenanceChange[] = rows.map(r => {
    // Stale when we resolved via a live symbol and the signature drifted, or
    // the row was already marked stale by a background job (B3).
    const drifted = currentSignatureHash != null
      && r.signature_hash != null
      && r.signature_hash !== currentSignatureHash;
    return {
      session_id: r.session_id ?? null,
      occurred_at: r.occurred_at_epoch,
      prompt_text: includePrompt && r.user_prompt_id != null
        ? store.getPromptTextById(r.user_prompt_id)
        : undefined,
      symbol: r.symbol_qualified_name ?? null,
      line_start: r.line_start,
      line_end: r.line_end,
      commit_sha: r.commit_sha ?? null,
      stale: r.stale || drifted,
    };
  });

  return {
    file,
    line,
    resolved_by: resolvedBy,
    symbol: anchor?.qualified_name ?? null,
    changes,
  };
}
