import React from 'react';
import { useCommits } from '../hooks/useCommits';
import { CommitGraph } from './CommitGraph';

interface CommitsPanelProps {
  isOpen: boolean;
  onClose: () => void;
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
        {!isLoading && commits.length > 0 && (
          <CommitGraph
            commits={commits}
            expandedSha={expandedSha}
            detailCache={detailCache}
            detailLoading={detailLoading}
            onToggle={toggleExpand}
          />
        )}
      </div>
    </div>
  );
}
