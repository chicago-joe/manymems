import React from 'react';
import { ThemeToggle } from './ThemeToggle';
import { ThemePreference } from '../hooks/useTheme';
import { GitHubStarsButton } from './GitHubStarsButton';
import { useSpinningFavicon } from '../hooks/useSpinningFavicon';

interface HeaderProps {
  isConnected: boolean;
  projects: string[];
  currentFilter: string;
  onFilterChange: (filter: string) => void;
  isProcessing: boolean;
  queueDepth: number;
  themePreference: ThemePreference;
  onThemeChange: (theme: ThemePreference) => void;
  onContextPreviewToggle: () => void;
  onShowHelp?: () => void;
  currentModelFilter: string;
  onModelFilterChange: (model: string) => void;
  availableModels: string[];
  activeView: 'dashboard' | 'feed' | 'api';
  onViewChange: (view: 'dashboard' | 'feed' | 'api') => void;
}

export function Header({
  isConnected: _isConnected,
  projects,
  currentFilter,
  onFilterChange,
  isProcessing,
  queueDepth,
  themePreference,
  onThemeChange,
  onContextPreviewToggle,
  onShowHelp,
  currentModelFilter,
  onModelFilterChange,
  availableModels,
  activeView,
  onViewChange,
}: HeaderProps) {
  useSpinningFavicon(isProcessing);

  return (
    <div className="header">
      <div className="header-main">
        <h1>
          <div style={{ position: 'relative', display: 'inline-block' }}>
            <svg viewBox="0 0 32 32" fill="none" className={`logomark ${isProcessing ? 'spinning' : ''}`}
                 xmlns="http://www.w3.org/2000/svg" width="28" height="28"
                 style={{ color: 'var(--mm-accent-amber)' }}>
              <rect x="1" y="1" width="30" height="30" rx="6" stroke="currentColor" strokeWidth="1.5"/>
              <circle cx="5" cy="5" r="1" fill="currentColor" opacity="0.5"/>
              <circle cx="27" cy="5" r="1" fill="currentColor" opacity="0.5"/>
              <circle cx="5" cy="27" r="1" fill="currentColor" opacity="0.5"/>
              <circle cx="27" cy="27" r="1" fill="currentColor" opacity="0.5"/>
              <polyline points="7,13 12,16 7,19" stroke="currentColor" strokeWidth="2"
                        strokeLinecap="round" strokeLinejoin="round"/>
              <line x1="14" y1="20" x2="25" y2="20" stroke="currentColor" strokeWidth="2"
                    strokeLinecap="round" className="mm-cursor"/>
            </svg>
            {queueDepth > 0 && (
              <div className="queue-bubble">
                {queueDepth}
              </div>
            )}
          </div>
          <span className="logo-text" style={{ color: 'var(--mm-accent-amber)' }}>manymems</span>
        </h1>
        <nav className="view-tabs">
          <button
            className={`view-tab${activeView === 'dashboard' ? ' active' : ''}`}
            onClick={() => onViewChange('dashboard')}
          >
            Dashboard
          </button>
          <button
            className={`view-tab${activeView === 'feed' ? ' active' : ''}`}
            onClick={() => onViewChange('feed')}
          >
            Feed
          </button>
          <button
            className={`view-tab${activeView === 'api' ? ' active' : ''}`}
            onClick={() => onViewChange('api')}
          >
            API
          </button>
        </nav>
      </div>
      <div className="status">
        <a
          href="https://docs.claude-mem.ai"
          target="_blank"
          rel="noopener noreferrer"
          className="icon-link"
          title="Documentation"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
          </svg>
        </a>
        <GitHubStarsButton username="chicago-joe" repo="manymems" />
        {availableModels.length > 0 && (
          <select
            value={currentModelFilter}
            onChange={e => onModelFilterChange(e.target.value)}
            title="Filter by model"
          >
            <option value="">All Models</option>
            {availableModels.map(m => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        )}
        <select
          value={currentFilter}
          onChange={e => onFilterChange(e.target.value)}
        >
          <option value="">All Projects</option>
          {projects.map(project => (
            <option key={project} value={project}>{project}</option>
          ))}
        </select>
        <ThemeToggle
          preference={themePreference}
          onThemeChange={onThemeChange}
        />
        <button
          className="settings-btn"
          onClick={() => onShowHelp?.()}
          title="Show welcome card"
          aria-label="Show welcome card"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path>
            <line x1="12" y1="17" x2="12.01" y2="17"></line>
          </svg>
        </button>
        <button
          className="settings-btn"
          onClick={onContextPreviewToggle}
          title="Settings"
        >
          <svg className="settings-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"></path>
            <circle cx="12" cy="12" r="3"></circle>
          </svg>
        </button>
      </div>
    </div>
  );
}
