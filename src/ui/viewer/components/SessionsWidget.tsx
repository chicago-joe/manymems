import React, { useMemo } from 'react';
import type { CommitRecord } from '../types';
import { formatDate } from '../utils/formatters';

interface SessionsWidgetProps {
  commits: CommitRecord[];
}

export function SessionsWidget({ commits }: SessionsWidgetProps) {
  const stats = useMemo(() => {
    const now = Date.now();
    const oneHour = 60 * 60 * 1000;
    const oneDay = 24 * oneHour;

    // Classify sessions by recency as a proxy for phase
    const active = commits.filter(c => now - c.earliest_epoch < oneHour);
    const idle = commits.filter(c => {
      const age = now - c.earliest_epoch;
      return age >= oneHour && age < oneDay;
    });
    const ended = commits.filter(c => now - c.earliest_epoch >= oneDay);

    const totalSessions = commits.reduce((sum, c) => sum + c.session_count, 0);

    return { active: active.length, idle: idle.length, ended: ended.length, total: commits.length, totalSessions };
  }, [commits]);

  const lastCommit = commits[0];

  return (
    <div className="dashboard-widget sessions-widget">
      <div className="widget-header">
        <span className="widget-title">Sessions</span>
        <span className="widget-count">{stats.total}</span>
      </div>
      <div className="widget-body">
        <div className="session-row">
          <span className="session-dot active-dot">●</span>
          <span className="session-label">Recent</span>
          <span className="session-value">{stats.active}</span>
        </div>
        <div className="session-row">
          <span className="session-dot idle-dot">○</span>
          <span className="session-label">Today</span>
          <span className="session-value">{stats.idle}</span>
        </div>
        <div className="session-row">
          <span className="session-dot ended-dot">─</span>
          <span className="session-label">Older</span>
          <span className="session-value">{stats.ended}</span>
        </div>
        <div className="widget-divider" />
        <div className="session-row total-row">
          <span className="session-label">Sessions linked</span>
          <span className="session-value">{stats.totalSessions}</span>
        </div>
      </div>
      {lastCommit && (
        <div className="widget-footer">
          Last: {formatDate(lastCommit.earliest_epoch)}
        </div>
      )}
    </div>
  );
}
