import React from 'react';
import { useTeams } from '../hooks/useTeams';
import { formatDate } from '../utils/formatters';
import type { Settings } from '../types';

interface TeamsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  settings: Settings;
}

export function TeamsPanel({ isOpen, onClose, settings }: TeamsPanelProps) {
  const { teams, members, apiKeys, isLoading, error, refresh } = useTeams(settings);

  if (!isOpen) return null;

  const isConfigured = !!settings.CLAUDE_MEM_SERVER_BETA_URL;

  return (
    <div className="teams-panel">
      <div className="panel-header">
        <h3>Team</h3>
        <div className="side-panel-controls">
          {isConfigured && (
            <button className="console-control-btn" onClick={refresh} disabled={isLoading} title="Refresh">↻</button>
          )}
          <button className="console-control-btn" onClick={onClose} title="Close">✕</button>
        </div>
      </div>

      {!isConfigured ? (
        <p className="teams-not-configured">
          Server beta not configured.
          Set CLAUDE_MEM_SERVER_BETA_URL and CLAUDE_MEM_SERVER_BETA_API_KEY to view team details.
        </p>
      ) : (
        <>
          {isLoading && <div className="side-panel-loading">Loading team data…</div>}
          {error && <div className="side-panel-error">⚠ {error}</div>}

          {!isLoading && !error && (
            <>
              {/* 1. Team info */}
              <section>
                <h4>Team</h4>
                {teams.length > 0 ? (
                  <span>
                    {teams[0].name}{' '}— <code className="sha-chip">{teams[0].id.slice(0, 8)}</code>
                  </span>
                ) : (
                  <span className="side-panel-empty">No teams found.</span>
                )}
              </section>

              {/* 2. Members table */}
              <section>
                <h4>Members</h4>
                {members.length > 0 ? (
                  <table className="teams-table">
                    <thead>
                      <tr>
                        <th>Actor</th>
                        <th>Role</th>
                        <th>Joined</th>
                      </tr>
                    </thead>
                    <tbody>
                      {members.map((m) => (
                        <tr key={m.actor_id}>
                          <td>{m.actor_id}</td>
                          <td>{m.role}</td>
                          <td>{formatDate(new Date(m.joined_at).getTime())}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <span className="side-panel-empty">No members found.</span>
                )}
              </section>

              {/* 3. API Keys table */}
              <section>
                <h4>API Keys</h4>
                {apiKeys.length > 0 ? (
                  <table className="teams-table">
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>Created</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {apiKeys.map((k) => (
                        <tr key={k.id}>
                          <td><code>{k.id.slice(0, 8)}</code></td>
                          <td>{formatDate(new Date(k.created_at).getTime())}</td>
                          <td>
                            <span className={k.revoked_at ? 'key-revoked' : 'key-active'}>
                              {k.revoked_at ? 'revoked' : 'active'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <span className="side-panel-empty">No API keys found.</span>
                )}
              </section>
            </>
          )}
        </>
      )}
    </div>
  );
}
