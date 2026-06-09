import React from 'react';
import { useCommits } from '../hooks/useCommits';
import { CommitGraph } from './CommitGraph';
import { SessionsWidget } from './SessionsWidget';
import { ModelsWidget } from './ModelsWidget';
import { AgentsWidget } from './AgentsWidget';
import { TeamWidget } from './TeamWidget';
import { ConfigWidget } from './ConfigWidget';
import type { Settings } from '../types';

interface DashboardViewProps {
  settings: Settings;
  onFileClick: (filePath: string) => void;
  onTeamsPanelOpen?: () => void;
}

export function DashboardView({ settings, onFileClick: _onFileClick, onTeamsPanelOpen }: DashboardViewProps) {
  const { commits, isLoading, error, refresh, expandedSha, toggleExpand, detailCache, detailLoading } = useCommits();

  return (
    <div className="dashboard-view">

      {/* Git Tree Hero Section */}
      <section className="dashboard-section git-tree-section">
        <div className="dashboard-section-header">
          <h2 className="dashboard-section-title">
            <span className="dashboard-section-icon">◉</span>
            Git History
          </h2>
          <button className="console-control-btn" onClick={refresh} disabled={isLoading} title="Refresh">↻</button>
        </div>
        <div className="git-tree-body">
          {isLoading && commits.length === 0 && (
            <div className="side-panel-loading">Loading commits…</div>
          )}
          {error && <div className="side-panel-error">⚠ {error}</div>}
          {!isLoading && !error && commits.length === 0 && (
            <div className="side-panel-empty">No commits linked yet. Make a commit after the post-commit hook is installed.</div>
          )}
          {commits.length > 0 && (
            <CommitGraph
              commits={commits}
              expandedSha={expandedSha}
              detailCache={detailCache}
              detailLoading={detailLoading}
              onToggle={toggleExpand}
            />
          )}
        </div>
      </section>

      {/* Widget Row */}
      <div className="dashboard-widgets">
        <SessionsWidget commits={commits} />
        <ModelsWidget />
        <AgentsWidget commits={commits} />
        <TeamWidget settings={settings} onOpenPanel={onTeamsPanelOpen} />
      </div>

      {/* Configuration status */}
      <ConfigWidget />

    </div>
  );
}
