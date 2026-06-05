import React from 'react';
import { useCommits } from '../hooks/useCommits';
import { formatDate } from '../utils/formatters';
import type { ProvenanceEntry } from '../types';

interface CommitsPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

function CommitDetail({ entries, isLoading }: { entries: ProvenanceEntry[]; isLoading: boolean }) {
  if (isLoading) return <div className="commit-detail-loading">Loading entries…</div>;
  if (entries.length === 0) return <div className="commit-detail-empty">No provenance entries found</div>;
  return (
    <div className="commit-detail">
      {entries.map(e => (
        <div key={e.id} className="commit-entry">
          <div className="commit-entry-loc">
            <code className="commit-entry-file">{e.file_path.split('/').pop()}</code>
            <span className="commit-entry-range">:{e.line_start}–{e.line_end}</span>
            {e.symbol_name && <span className="commit-entry-symbol">{e.symbol_name}</span>}
            {e.symbol_kind && <span className="commit-entry-kind">{e.symbol_kind}</span>}
          </div>
          {e.prompt_text && (
            <div className="commit-entry-prompt">
              "{e.prompt_text.slice(0, 120)}{e.prompt_text.length > 120 ? '…' : ''}"
            </div>
          )}
          {e.agent_type && <span className="commit-entry-agent">{e.agent_type}</span>}
        </div>
      ))}
    </div>
  );
}

export function CommitsPanel({ isOpen, onClose }: CommitsPanelProps) {
  const { commits, isLoading, error, refresh, expandedSha, toggleExpand, detailCache, detailLoading } = useCommits();

  if (!isOpen) return null;

  return (
    <div className="side-panel commits-panel">
      <div className="side-panel-header">
        <div className="side-panel-title">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="side-panel-icon commits-icon">
            <circle cx="12" cy="12" r="3"/>
            <line x1="3" y1="12" x2="9" y2="12"/>
            <line x1="15" y1="12" x2="21" y2="12"/>
          </svg>
          <span>Commits</span>
          <span className="side-panel-subtitle">{commits.length} tracked</span>
        </div>
        <div className="side-panel-controls">
          <button className="console-control-btn" onClick={refresh} disabled={isLoading} title="Refresh">↻</button>
          <button className="console-control-btn" onClick={onClose} title="Close">✕</button>
        </div>
      </div>

      <div className="side-panel-body">
        {isLoading && <div className="side-panel-loading">Loading commits…</div>}
        {error && <div className="side-panel-error">⚠ {error}</div>}
        {!isLoading && !error && commits.length === 0 && (
          <div className="side-panel-empty">No commits linked yet. Make a commit after the post-commit hook is installed.</div>
        )}
        {!isLoading && commits.map(c => (
          <div key={c.commit_sha} className={`commit-row ${expandedSha === c.commit_sha ? 'expanded' : ''}`}>
            <button className="commit-summary" onClick={() => toggleExpand(c.commit_sha)}>
              <code className="commit-sha">{c.commit_sha.slice(0, 8)}</code>
              <span className="commit-date">{formatDate(c.earliest_epoch)}</span>
              <span className="commit-edits">{c.edit_count} edit{c.edit_count !== 1 ? 's' : ''}</span>
              <span className="commit-files-preview">
                {c.files.slice(0, 2).map(f => f.split('/').pop()).join(', ')}
                {c.files.length > 2 ? ` +${c.files.length - 2}` : ''}
              </span>
              <span className="commit-chevron">{expandedSha === c.commit_sha ? '▾' : '▸'}</span>
            </button>
            {expandedSha === c.commit_sha && (
              <CommitDetail
                entries={detailCache[c.commit_sha] ?? []}
                isLoading={detailLoading === c.commit_sha}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
