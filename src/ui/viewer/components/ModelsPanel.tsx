import React from 'react';
import { useModels } from '../hooks/useModels';
import { formatDate } from '../utils/formatters';
import type { ModelStats } from '../types';

interface ModelsPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

function ModelBar({ model }: { model: ModelStats }) {
  const shortName = model.generated_by_model
    ? model.generated_by_model.replace(/-\d{8}$/, '').replace(/^claude-/, '').replace(/^gemini-/, 'gemini/')
    : '(unknown)';
  const providerColor = model.platform_source === 'gemini' ? '#4285f4'
    : model.platform_source === 'openrouter' ? '#7c3aed'
    : '#00d4d4';

  return (
    <div className="model-bar-row">
      <div className="model-bar-label">
        <span className="model-bar-name">{shortName}</span>
        <span className="model-bar-provider" style={{ color: providerColor }}>{model.platform_source}</span>
      </div>
      <div className="model-bar-stats">
        <span className="model-bar-count">{model.count.toLocaleString()}</span>
        <span className="model-bar-date">{formatDate(model.last_seen_epoch)}</span>
      </div>
    </div>
  );
}

export function ModelsPanel({ isOpen, onClose }: ModelsPanelProps) {
  const { models, isLoading, error, refresh } = useModels();

  if (!isOpen) return null;

  const totalObs = models.reduce((sum, m) => sum + m.count, 0);

  return (
    <div className="side-panel models-panel">
      <div className="side-panel-header">
        <div className="side-panel-title">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="side-panel-icon models-icon">
            <rect x="2" y="3" width="7" height="7" rx="1"/>
            <rect x="9" y="3" width="7" height="7" rx="1"/>
            <rect x="16" y="3" width="6" height="7" rx="1"/>
            <rect x="2" y="14" width="20" height="7" rx="1"/>
          </svg>
          <span>Models</span>
          <span className="side-panel-subtitle">{totalObs.toLocaleString()} observations</span>
        </div>
        <div className="side-panel-controls">
          <button className="console-control-btn" onClick={refresh} disabled={isLoading} title="Refresh">↻</button>
          <button className="console-control-btn" onClick={onClose} title="Close">✕</button>
        </div>
      </div>

      <div className="side-panel-body">
        {isLoading && <div className="side-panel-loading">Loading models…</div>}
        {error && <div className="side-panel-error">⚠ {error}</div>}
        {!isLoading && !error && models.length === 0 && (
          <div className="side-panel-empty">No model data yet. Observations will be captured here once processing begins.</div>
        )}
        {!isLoading && models.length > 0 && (
          <div className="models-list">
            {models.map((m, i) => (
              <ModelBar key={`${m.generated_by_model}-${m.platform_source}-${i}`} model={m} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
