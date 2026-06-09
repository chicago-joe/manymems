import React, { useMemo } from 'react';
import type { CommitRecord } from '../types';
import { modelColor } from './CommitGraph';

interface AgentsWidgetProps {
  commits: CommitRecord[];
}

function toAgentName(model: string): string {
  const m = model.toLowerCase();
  if (m.includes('claude')) return 'claude-code';
  if (m.includes('gemini')) return 'gemini-cli';
  if (m.includes('cursor')) return 'cursor';
  if (m.includes('gpt') || m.includes('openrouter')) return 'openrouter';
  if (m.includes('codex')) return 'codex';
  if (m.includes('windsurf')) return 'windsurf';
  return model || 'unknown';
}

export function AgentsWidget({ commits }: AgentsWidgetProps) {
  const agents = useMemo(() => {
    const map = new Map<string, { model: string; commitCount: number; lastEpoch: number; sessionCount: number }>();
    const now = Date.now();

    for (const c of commits) {
      for (const model of c.models) {
        const agentName = toAgentName(model);
        const existing = map.get(agentName);
        if (existing) {
          existing.commitCount += 1;
          existing.sessionCount += c.session_count;
          if (c.earliest_epoch > existing.lastEpoch) existing.lastEpoch = c.earliest_epoch;
        } else {
          map.set(agentName, {
            model,
            commitCount: 1,
            sessionCount: c.session_count,
            lastEpoch: c.earliest_epoch,
          });
        }
      }
    }

    return Array.from(map.entries())
      .map(([name, data]) => ({
        name,
        model: data.model,
        commitCount: data.commitCount,
        sessionCount: data.sessionCount,
        lastEpoch: data.lastEpoch,
        isActive: now - data.lastEpoch < 60 * 60 * 1000,
      }))
      .sort((a, b) => b.commitCount - a.commitCount);
  }, [commits]);

  return (
    <div className="dashboard-widget agents-widget">
      <div className="widget-header">
        <span className="widget-title">Agents</span>
        <span className="widget-count">{agents.length}</span>
      </div>
      <div className="widget-body">
        {agents.length === 0 && (
          <span className="widget-empty">No agents detected yet</span>
        )}
        {agents.map((agent) => (
          <div key={agent.name} className="agent-row">
            <span className="agent-dot" style={{ color: modelColor(agent.model) }}>●</span>
            <span className="agent-name">{agent.name}</span>
            {agent.isActive && <span className="agent-active-badge">active</span>}
            <span className="agent-count">{agent.commitCount}c</span>
          </div>
        ))}
      </div>
    </div>
  );
}
