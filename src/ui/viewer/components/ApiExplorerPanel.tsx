import React, { useState } from 'react';

interface Endpoint {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  description: string;
}

interface ApiGroup {
  name: string;
  endpoints: Endpoint[];
}

const API_GROUPS: ApiGroup[] = [
  {
    name: 'Dashboard',
    endpoints: [
      { method: 'GET', path: '/api/sessions/summary', description: 'Active / idle / ended session counts' },
      { method: 'GET', path: '/api/commits/:sha/attribution', description: 'AI attribution % for a commit' },
      { method: 'GET', path: '/api/agents', description: 'Detected agents and activity' },
    ],
  },
  {
    name: 'Data',
    endpoints: [
      { method: 'GET', path: '/api/observations', description: 'Paginated observations' },
      { method: 'GET', path: '/api/summaries', description: 'Session summaries' },
      { method: 'GET', path: '/api/prompts', description: 'User prompts' },
      { method: 'GET', path: '/api/observation/:id', description: 'Single observation by ID' },
      { method: 'GET', path: '/api/observations/by-file', description: 'Observations touching a file' },
      { method: 'POST', path: '/api/observations/batch', description: 'Batch fetch observations by IDs' },
      { method: 'GET', path: '/api/session/:id', description: 'Session by ID' },
      { method: 'POST', path: '/api/sdk-sessions/batch', description: 'Batch fetch SDK sessions' },
      { method: 'GET', path: '/api/prompt/:id', description: 'Prompt by ID' },
      { method: 'GET', path: '/api/stats', description: 'Global counts (obs, sessions, summaries)' },
      { method: 'GET', path: '/api/models/stats', description: 'Per-model observation statistics' },
      { method: 'GET', path: '/api/projects', description: 'Project list with platform source filter' },
      { method: 'GET', path: '/api/processing-status', description: 'Queue depth and processing state' },
      { method: 'POST', path: '/api/processing', description: 'Set processing mode' },
      { method: 'POST', path: '/api/import', description: 'Import observation batch' },
    ],
  },
  {
    name: 'Search',
    endpoints: [
      { method: 'GET', path: '/api/search', description: 'Unified full-text search' },
      { method: 'GET', path: '/api/timeline', description: 'Unified timeline' },
      { method: 'GET', path: '/api/decisions', description: 'Decision observations' },
      { method: 'GET', path: '/api/changes', description: 'Change observations' },
      { method: 'GET', path: '/api/how-it-works', description: 'How-it-works observations' },
      { method: 'GET', path: '/api/search/observations', description: 'Search observations' },
      { method: 'GET', path: '/api/search/sessions', description: 'Search sessions' },
      { method: 'GET', path: '/api/search/prompts', description: 'Search prompts' },
      { method: 'GET', path: '/api/search/by-concept', description: 'Search by concept' },
      { method: 'GET', path: '/api/search/by-file', description: 'Search by file path' },
      { method: 'GET', path: '/api/search/by-type', description: 'Search by observation type' },
      { method: 'GET', path: '/api/context/recent', description: 'Recent context for injection' },
      { method: 'GET', path: '/api/context/timeline', description: 'Context timeline' },
      { method: 'GET', path: '/api/context/preview', description: 'Context preview' },
      { method: 'GET', path: '/api/context/inject', description: 'Inject context into session' },
      { method: 'POST', path: '/api/context/semantic', description: 'Semantic context search' },
      { method: 'GET', path: '/api/timeline/by-query', description: 'Timeline filtered by query' },
      { method: 'GET', path: '/api/search/help', description: 'Search help and syntax reference' },
    ],
  },
  {
    name: 'Provenance',
    endpoints: [
      { method: 'POST', path: '/api/provenance/link-commit', description: 'Link session to git commit' },
      { method: 'GET', path: '/api/provenance/by-line', description: 'Provenance for a file line' },
      { method: 'GET', path: '/api/provenance/commits', description: 'All commits with provenance' },
      { method: 'GET', path: '/api/provenance/by-commit', description: 'Sessions and files for a commit SHA' },
    ],
  },
  {
    name: 'Observations',
    endpoints: [
      { method: 'POST', path: '/api/observations/:id/promote', description: 'Promote observation to memory' },
      { method: 'GET', path: '/api/observations/:id/staleness', description: 'Staleness score for observation' },
      { method: 'POST', path: '/api/observations/multimodal', description: 'Multimodal observation capture' },
      { method: 'GET', path: '/api/observations/:id/content', description: 'Raw content for observation' },
    ],
  },
  {
    name: 'Memory',
    endpoints: [
      { method: 'POST', path: '/api/memory/save', description: 'Save observation as memory' },
    ],
  },
  {
    name: 'Settings',
    endpoints: [
      { method: 'GET', path: '/api/settings', description: 'Current worker settings' },
      { method: 'POST', path: '/api/settings', description: 'Update worker settings' },
      { method: 'GET', path: '/api/mcp/status', description: 'MCP server connection status' },
      { method: 'POST', path: '/api/mcp/toggle', description: 'Enable / disable MCP server' },
      { method: 'GET', path: '/api/branch/status', description: 'Current git branch info' },
      { method: 'POST', path: '/api/branch/switch', description: 'Switch active branch' },
      { method: 'POST', path: '/api/branch/update', description: 'Pull latest on current branch' },
    ],
  },
];

export function ApiExplorerPanel() {
  const [openGroup, setOpenGroup] = useState<string>('Dashboard');

  return (
    <div className="api-explorer">
      <div className="api-explorer-header">
        <h2 className="api-explorer-title">
          <span className="dashboard-section-icon">◈</span>
          API Reference
        </h2>
        <a
          href="https://github.com/chicago-joe/manymems"
          target="_blank"
          rel="noopener noreferrer"
          className="api-explorer-docs-link"
        >
          Full Docs ↗
        </a>
      </div>
      <div className="api-explorer-body">
        <nav className="api-group-nav">
          {API_GROUPS.map(g => (
            <button
              key={g.name}
              className={`api-group-btn${openGroup === g.name ? ' active' : ''}`}
              onClick={() => setOpenGroup(g.name)}
            >
              {g.name}
              <span className="api-group-count">{g.endpoints.length}</span>
            </button>
          ))}
        </nav>
        <div className="api-endpoint-list">
          {(API_GROUPS.find(g => g.name === openGroup)?.endpoints ?? []).map(ep => (
            <div key={ep.path} className="api-endpoint-row">
              <span className={`api-method-badge api-method-badge--${ep.method.toLowerCase()}`}>
                {ep.method}
              </span>
              <code className="api-endpoint-path">{ep.path}</code>
              <span className="api-endpoint-desc">{ep.description}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
