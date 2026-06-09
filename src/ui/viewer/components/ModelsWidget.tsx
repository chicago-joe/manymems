import React from 'react';
import { useModels } from '../hooks/useModels';
import { modelColor } from './CommitGraph';

export function ModelsWidget() {
  const { models, isLoading } = useModels();

  const totalObs = models.reduce((sum, m) => sum + m.count, 0);
  const top3 = models.slice(0, 3);

  return (
    <div className="dashboard-widget models-widget">
      <div className="widget-header">
        <span className="widget-title">Models</span>
        <span className="widget-count">{models.length}</span>
      </div>
      <div className="widget-body">
        {isLoading && <span className="widget-loading">Loading…</span>}
        {!isLoading && top3.length === 0 && (
          <span className="widget-empty">No model data yet</span>
        )}
        {top3.map((m, i) => {
          const pct = totalObs > 0 ? Math.round((m.count / totalObs) * 100) : 0;
          const name = m.generated_by_model
            ? m.generated_by_model.replace(/-\d{8}$/, '').replace(/^claude-/, '').replace(/^gemini-/, 'G/')
            : '(unknown)';
          const color = modelColor(m.generated_by_model ?? 'unknown');
          return (
            <div key={i} className="model-widget-row">
              <span className="model-widget-dot" style={{ color }}> ● </span>
              <span className="model-widget-name" title={m.generated_by_model ?? ''}>{name}</span>
              <div className="model-widget-bar-wrap">
                <div className="model-widget-bar" style={{ width: `${pct}%`, background: color }} />
              </div>
              <span className="model-widget-pct">{pct}%</span>
            </div>
          );
        })}
        {models.length > 3 && (
          <div className="widget-more">+{models.length - 3} more</div>
        )}
      </div>
      <div className="widget-footer">{totalObs.toLocaleString()} observations</div>
    </div>
  );
}
