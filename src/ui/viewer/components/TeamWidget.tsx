import React from 'react';
import { useTeams } from '../hooks/useTeams';
import type { Settings } from '../types';

interface TeamWidgetProps {
  settings: Settings;
  onOpenPanel?: () => void;
}

export function TeamWidget({ settings, onOpenPanel }: TeamWidgetProps) {
  const { teams, members, apiKeys, isLoading } = useTeams(settings);

  const serverBetaEnabled = !!settings.CLAUDE_MEM_SERVER_BETA_URL;

  if (!serverBetaEnabled) {
    return (
      <div className="dashboard-widget team-widget team-widget--disabled">
        <div className="widget-header">
          <span className="widget-title">Team</span>
        </div>
        <div className="widget-body">
          <span className="widget-empty">Configure server-beta to enable team features</span>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-widget team-widget">
      <div className="widget-header">
        <span className="widget-title">Team</span>
        <span className="widget-count">{members.length}</span>
      </div>
      <div className="widget-body">
        {isLoading && <span className="widget-loading">Loading…</span>}
        {!isLoading && teams.length === 0 && (
          <span className="widget-empty">No teams configured</span>
        )}
        {!isLoading && members.length > 0 && (
          <div className="team-members-row">
            {members.slice(0, 5).map((m) => (
              <span key={m.actor_id} className="team-avatar" title={m.role}>
                {m.actor_id.slice(0, 2).toUpperCase()}
              </span>
            ))}
            {members.length > 5 && <span className="team-avatar team-avatar--more">+{members.length - 5}</span>}
          </div>
        )}
        {!isLoading && apiKeys.length > 0 && (
          <div className="team-keys-row">
            <span className="team-keys-label">{apiKeys.length} API key{apiKeys.length !== 1 ? 's' : ''}</span>
          </div>
        )}
      </div>
      {onOpenPanel && (
        <div className="widget-footer">
          <button className="widget-link-btn" onClick={onOpenPanel}>Configure →</button>
        </div>
      )}
    </div>
  );
}
