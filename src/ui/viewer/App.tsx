import React, { useState, useEffect, useCallback } from 'react';
import { Header } from './components/Header';
import { ContextSettingsModal } from './components/ContextSettingsModal';
import { LogsDrawer } from './components/LogsModal';
import { TeamsPanel } from './components/TeamsPanel';
import { DashboardView } from './components/DashboardView';
import { ApiExplorerPanel } from './components/ApiExplorerPanel';
import type { DrillDownFilter } from './components/DashboardView';
import { WelcomeCard, getStoredWelcomeDismissed, setStoredWelcomeDismissed } from './components/WelcomeCard';
import { useSSE } from './hooks/useSSE';
import { useSettings } from './hooks/useSettings';
import { useStats } from './hooks/useStats';
import { useTheme } from './hooks/useTheme';
import { useProvenance } from './hooks/useProvenance';
import { ProvenanceDrawer } from './components/ProvenanceDrawer';

export function App() {
  const [currentFilter, setCurrentFilter] = useState('');
  const [contextPreviewOpen, setContextPreviewOpen] = useState(false);
  const [logsModalOpen, setLogsModalOpen] = useState(false);
  const [activeView, setActiveView] = useState<'dashboard' | 'api'>('dashboard');
  const [teamsPanelOpen, setTeamsPanelOpen] = useState(false);
  const [welcomeDismissed, setWelcomeDismissed] = useState<boolean>(getStoredWelcomeDismissed);

  const { observations, projects, isProcessing, queueDepth, isConnected } = useSSE();
  const { settings, saveSettings, isSaving, saveStatus } = useSettings();
  const { refreshStats } = useStats();
  const { preference, setThemePreference } = useTheme();
  const { target: provTarget, entries: provEntries, isLoading: provLoading, error: provError, open: openProvenance, close: closeProvenance } = useProvenance();

  useEffect(() => {
    if (currentFilter && !projects.includes(currentFilter)) {
      setCurrentFilter('');
    }
  }, [projects, currentFilter]);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleDrillDown = useCallback((_filter: DrillDownFilter) => {
    // no-op: Feed view removed
  }, []);

  const toggleContextPreview = useCallback(() => {
    setContextPreviewOpen(prev => !prev);
  }, []);

  const toggleLogsModal = useCallback(() => {
    setLogsModalOpen(prev => !prev);
  }, []);

  useEffect(() => {
    refreshStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [observations.length]);

  return (
    <>
      <Header
        isConnected={isConnected}
        projects={projects}
        currentFilter={currentFilter}
        onFilterChange={setCurrentFilter}
        isProcessing={isProcessing}
        queueDepth={queueDepth}
        themePreference={preference}
        onThemeChange={setThemePreference}
        onContextPreviewToggle={toggleContextPreview}
        onShowHelp={() => {
          setStoredWelcomeDismissed(false);
          setWelcomeDismissed(false);
        }}
        activeView={activeView}
        onViewChange={setActiveView}
      />

      {activeView === 'api' ? (
        <ApiExplorerPanel />
      ) : (
        <DashboardView
          settings={settings}
          onFileClick={(filePath: string) => openProvenance({ file: filePath, line: 1 })}
          onTeamsPanelOpen={() => setTeamsPanelOpen(true)}
          onDrillDown={handleDrillDown}
        />
      )}
      <TeamsPanel isOpen={teamsPanelOpen} onClose={() => setTeamsPanelOpen(false)} settings={settings} />

      {!welcomeDismissed && (
        <WelcomeCard onDismiss={() => setWelcomeDismissed(true)} />
      )}

      <ContextSettingsModal
        isOpen={contextPreviewOpen}
        onClose={toggleContextPreview}
        settings={settings}
        onSave={saveSettings}
        isSaving={isSaving}
        saveStatus={saveStatus}
      />

      <button
        className="console-toggle-btn"
        onClick={toggleLogsModal}
        title="Toggle Console"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="4 17 10 11 4 5"></polyline>
          <line x1="12" y1="19" x2="20" y2="19"></line>
        </svg>
      </button>

      <LogsDrawer
        isOpen={logsModalOpen}
        onClose={toggleLogsModal}
      />

      <ProvenanceDrawer
        target={provTarget}
        entries={provEntries}
        isLoading={provLoading}
        error={provError}
        onClose={closeProvenance}
      />
    </>
  );
}
