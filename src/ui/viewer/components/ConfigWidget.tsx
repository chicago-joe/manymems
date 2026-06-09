import React from 'react';

interface EntireConfig {
  enabled?: boolean;
  commitLinking?: string;
  logLevel?: string;
  externalAgents?: boolean;
}

interface ConfigWidgetProps {
  config?: EntireConfig;
}

export function ConfigWidget({ config }: ConfigWidgetProps) {
  if (!config) {
    return (
      <div className="config-widget config-widget--empty">
        <div className="config-widget-label">.entire/settings.json</div>
        <span className="config-widget-not-configured">not configured — run: entire enable</span>
      </div>
    );
  }

  return (
    <div className="config-widget">
      <div className="config-widget-label">.entire/settings.json</div>
      <div className="config-widget-fields">
        <span className="config-field">
          <span className="config-key">enabled</span>
          <span className={`config-val ${config.enabled !== false ? 'config-val--on' : 'config-val--off'}`}>
            {config.enabled !== false ? '✓' : '✗'}
          </span>
        </span>
        {config.commitLinking && (
          <span className="config-field">
            <span className="config-key">commit_linking</span>
            <span className="config-val">{config.commitLinking}</span>
          </span>
        )}
        {config.logLevel && (
          <span className="config-field">
            <span className="config-key">log_level</span>
            <span className="config-val">{config.logLevel}</span>
          </span>
        )}
        <span className="config-field">
          <span className="config-key">external_agents</span>
          <span className={`config-val ${config.externalAgents ? 'config-val--on' : 'config-val--off'}`}>
            {config.externalAgents ? 'on' : 'off'}
          </span>
        </span>
      </div>
    </div>
  );
}
