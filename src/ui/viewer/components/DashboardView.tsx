import React from 'react';
import { useCommits } from '../hooks/useCommits';
import { CommitGraph } from './CommitGraph';
import { SessionsWidget } from './SessionsWidget';
import { ModelsWidget } from './ModelsWidget';
import { AgentsWidget } from './AgentsWidget';
import { TeamWidget } from './TeamWidget';
import { ConfigWidget } from './ConfigWidget';
import type { Settings } from '../types';

export type DrillDownFilter =
  | { type: 'agent'; agentName: string }
  | { type: 'model'; model: string }
  | { type: 'bucket'; bucket: 'active' | 'idle' | 'ended' };

interface DashboardViewProps {
  settings: Settings;
  onFileClick: (filePath: string) => void;
  onTeamsPanelOpen?: () => void;
  onDrillDown: (filter: DrillDownFilter) => void;
}

export function DashboardView({ settings, onFileClick: _onFileClick, onTeamsPanelOpen, onDrillDown }: DashboardViewProps) {
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
        <SessionsWidget commits={commits} onBucketClick={b => onDrillDown({ type: 'bucket', bucket: b })} />
        <ModelsWidget onModelClick={m => onDrillDown({ type: 'model', model: m })} />
        <AgentsWidget commits={commits} onAgentClick={name => onDrillDown({ type: 'agent', agentName: name })} />
        <TeamWidget settings={settings} onOpenPanel={onTeamsPanelOpen} />
      </div>

      {/* Configuration status */}
      <ConfigWidget />

    </div>
  );
}
