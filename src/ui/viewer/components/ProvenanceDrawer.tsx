import React from 'react';
import { formatDate } from '../utils/formatters';
import type { ProvenanceEntry } from '../types';
import type { ProvenanceTarget } from '../hooks/useProvenance';

interface ProvenanceDrawerProps {
  target: ProvenanceTarget | null;
  entries: ProvenanceEntry[];
  isLoading: boolean;
  error: string | null;
  onClose: () => void;
}

export function ProvenanceDrawer({ target, entries, isLoading, error, onClose }: ProvenanceDrawerProps) {
  if (!target) return null;

  const fileName = target.file.split('/').pop() ?? target.file;

  return (
    <div className="side-panel provenance-drawer">
      <div className="side-panel-header">
        <div className="side-panel-title">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="side-panel-icon provenance-icon">
            <path d="M3 3h18v18H3z" opacity=".2"/>
            <path d="M9 9h6M9 12h6M9 15h4"/>
            <path d="M3 9h3M3 12h3M3 15h3"/>
          </svg>
          <span>Why</span>
          <code className="side-panel-file-ref">{fileName}:{target.line}</code>
        </div>
        <button className="console-control-btn" onClick={onClose} title="Close">✕</button>
      </div>

      <div className="provenance-file-path" title={target.file}>{target.file}</div>

      <div className="side-panel-body">
        {isLoading && (
          <div className="side-panel-loading">
            <span className="prov-loading-indicator">⬡</span> Tracing intent…
          </div>
        )}
        {error && <div className="side-panel-error">⚠ {error}</div>}
        {!isLoading && !error && entries.length === 0 && (
          <div className="side-panel-empty">No provenance recorded for this line yet.</div>
        )}
        {!isLoading && entries.map((e, i) => (
          <div key={e.id ?? i} className="prov-entry">
            <div className="prov-entry-header">
              <div className="prov-entry-meta">
                {e.agent_type && <span className="prov-agent-badge">{e.agent_type}</span>}
                {e.symbol_name && (
                  <span className="prov-symbol-badge" title={e.symbol_kind ?? ''}>
                    {e.symbol_kind === 'function' ? 'ƒ ' : e.symbol_kind === 'class' ? '◆ ' : ''}
                    {e.symbol_name}
                  </span>
                )}
                {e.commit_sha && (
                  <code className="prov-commit-sha" title={e.commit_sha}>{e.commit_sha.slice(0, 8)}</code>
                )}
              </div>
              <span className="prov-entry-date">{formatDate(e.created_at_epoch)}</span>
            </div>
            {e.prompt_text && (
              <blockquote className="prov-prompt-text">
                {e.prompt_text}
              </blockquote>
            )}
            <div className="prov-entry-loc">
              <span className="prov-file-range">{e.file_path.split('/').pop()}:{e.line_start}–{e.line_end}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
