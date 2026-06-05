import React from 'react';
import { formatDate } from '../utils/formatters';
import type { CommitRecord, ProvenanceEntry } from '../types';

// ── color palette ────────────────────────────────────────────────────────────
const LANE_COLORS: Record<string, string> = {
  'claude':      '#00d4d4',
  'claude-code': '#00d4d4',
  'gemini':      '#4285f4',
  'gemini-cli':  '#4285f4',
  'openrouter':  '#a78bfa',
  'cursor':      '#f59e0b',
  'codex':       '#34d399',
  'windsurf':    '#38bdf8',
  'raw':         '#94a3b8',
  'unknown':     '#6b7280',
};

export function modelColor(model: string): string {
  const key = Object.keys(LANE_COLORS).find(k => model.toLowerCase().includes(k));
  return key ? LANE_COLORS[key] : LANE_COLORS.unknown;
}

function primaryModel(models: string[]): string {
  return models[0] ?? 'unknown';
}

// ── graph geometry ────────────────────────────────────────────────────────────
const LANE_WIDTH = 18;
const ROW_HEIGHT = 46;
const DOT_R = 5;
const GRAPH_PAD = 8;

interface CommitGraphProps {
  commits: CommitRecord[];
  expandedSha: string | null;
  detailCache: Record<string, ProvenanceEntry[]>;
  detailLoading: string | null;
  onToggle: (sha: string) => void;
}

export function CommitGraph({ commits, expandedSha, detailCache, detailLoading, onToggle }: CommitGraphProps) {
  // Assign a lane index to each unique primary model, ordered by first appearance
  const laneOrder: string[] = [];
  for (const c of commits) {
    const m = primaryModel(c.models);
    if (!laneOrder.includes(m)) laneOrder.push(m);
  }
  const laneIndex = Object.fromEntries(laneOrder.map((m, i) => [m, i]));
  const numLanes = Math.max(laneOrder.length, 1);
  const svgWidth = GRAPH_PAD * 2 + numLanes * LANE_WIDTH;

  // Pre-compute row Y positions accounting for expanded rows
  type RowInfo = { y: number; commit: CommitRecord; expanded: boolean };
  const rows: RowInfo[] = [];
  let curY = GRAPH_PAD;
  for (const c of commits) {
    rows.push({ y: curY, commit: c, expanded: expandedSha === c.commit_sha });
    const entries = detailCache[c.commit_sha] ?? [];
    const expandedH = expandedSha === c.commit_sha
      ? Math.max(entries.length * 60 + 16, 60)
      : 0;
    curY += ROW_HEIGHT + expandedH;
  }
  const svgHeight = curY + GRAPH_PAD;

  // Dot center X for a given model
  const dotX = (model: string) => GRAPH_PAD + laneIndex[model] * LANE_WIDTH + LANE_WIDTH / 2;
  const dotY = (rowY: number) => rowY + ROW_HEIGHT / 2;

  // Build SVG path segments — vertical lane lines between consecutive same-lane commits
  const laneSegments: Array<{ x: number; y1: number; y2: number; color: string }> = [];
  for (const model of laneOrder) {
    const modelRows = rows.filter(r => primaryModel(r.commit.models) === model);
    for (let i = 0; i < modelRows.length - 1; i++) {
      laneSegments.push({
        x: dotX(model),
        y1: dotY(modelRows[i].y),
        y2: dotY(modelRows[i + 1].y),
        color: modelColor(model),
      });
    }
  }

  return (
    <div className="commit-graph-container">
      {/* Legend */}
      <div className="commit-graph-legend">
        {laneOrder.map(m => (
          <span key={m} className="commit-graph-legend-item">
            <span className="commit-graph-legend-dot" style={{ background: modelColor(m) }} />
            {m}
          </span>
        ))}
      </div>

      {/* Graph */}
      <div className="commit-graph-body" style={{ position: 'relative' }}>
        {/* SVG — lanes + dots */}
        <svg
          className="commit-graph-svg"
          width={svgWidth}
          height={svgHeight}
          style={{ position: 'absolute', left: 0, top: 0, pointerEvents: 'none' }}
        >
          {/* Lane lines */}
          {laneSegments.map((seg, i) => (
            <line
              key={i}
              x1={seg.x} y1={seg.y1}
              x2={seg.x} y2={seg.y2}
              stroke={seg.color}
              strokeWidth={2}
              opacity={0.5}
            />
          ))}
          {/* Dots */}
          {rows.map(({ y, commit }) => {
            const model = primaryModel(commit.models);
            const cx = dotX(model);
            const cy = dotY(y);
            const color = modelColor(model);
            return (
              <g key={commit.commit_sha}>
                {/* Glow ring */}
                <circle cx={cx} cy={cy} r={DOT_R + 3} fill={color} opacity={0.15} />
                {/* Main dot */}
                <circle cx={cx} cy={cy} r={DOT_R} fill={color} stroke="#1a1a1a" strokeWidth={1.5} />
                {/* Extra model dots (multi-model commits) */}
                {commit.models.slice(1, 3).map((m, mi) => (
                  <circle
                    key={m}
                    cx={cx + (mi + 1) * 7}
                    cy={cy - 5}
                    r={3}
                    fill={modelColor(m)}
                    opacity={0.85}
                  />
                ))}
              </g>
            );
          })}
        </svg>

        {/* Commit rows (positioned to match SVG) */}
        <div style={{ marginLeft: svgWidth + 8 }}>
          {rows.map(({ commit, expanded }) => {
            const model = primaryModel(commit.models);
            const color = modelColor(model);
            const entries = detailCache[commit.commit_sha] ?? [];
            const isLoading = detailLoading === commit.commit_sha;
            const shortFiles = commit.files.slice(0, 2).map(f => f.split('/').pop()).join(', ')
              + (commit.files.length > 2 ? ` +${commit.files.length - 2}` : '');

            return (
              <div key={commit.commit_sha} className="commit-graph-row">
                <button
                  className={`commit-graph-row-header${expanded ? ' expanded' : ''}`}
                  onClick={() => onToggle(commit.commit_sha)}
                  style={{ height: ROW_HEIGHT, borderLeft: `3px solid ${color}22` }}
                >
                  <div className="commit-graph-row-top">
                    <code className="commit-sha" style={{ color }}>{commit.commit_sha.slice(0, 8)}</code>
                    <span className="commit-date">{formatDate(commit.earliest_epoch)}</span>
                    <span className="commit-edits">{commit.edit_count} edit{commit.edit_count !== 1 ? 's' : ''}</span>
                    <span className="commit-files-preview">{shortFiles}</span>
                    {commit.session_count > 1 && (
                      <span className="commit-sessions">{commit.session_count} sessions</span>
                    )}
                    <span className="commit-chevron">{expanded ? '▾' : '▸'}</span>
                  </div>
                  {commit.prompt_preview && (
                    <div className="commit-graph-prompt-preview" style={{ color: `${color}cc` }}>
                      {commit.prompt_preview.slice(0, 90)}{commit.prompt_preview.length > 90 ? '…' : ''}
                    </div>
                  )}
                </button>

                {expanded && (
                  <div className="commit-graph-detail">
                    {isLoading && <div className="commit-detail-loading">Loading…</div>}
                    {!isLoading && entries.length === 0 && (
                      <div className="commit-detail-empty">No entries</div>
                    )}
                    {!isLoading && entries.map(e => {
                      const pathParts = e.file_path.split('/');
                      const displayPath = pathParts.slice(-2).join('/');
                      const hashDiff = e.old_content_hash && e.new_content_hash
                        ? `${e.old_content_hash.slice(0, 7)} → ${e.new_content_hash.slice(0, 7)}`
                        : null;
                      return (
                        <div key={e.id} className={`commit-entry${e.stale ? ' commit-entry-stale' : ''}`}>
                          <div className="commit-entry-loc">
                            <code className="commit-entry-file" title={e.file_path}>{displayPath}</code>
                            <span className="commit-entry-range">:{e.line_start}–{e.line_end}</span>
                            {e.symbol_name && <span className="commit-entry-symbol">{e.symbol_name}</span>}
                            {e.symbol_kind && <span className="commit-entry-kind">{e.symbol_kind}</span>}
                            {e.stale === 1 && <span className="commit-entry-stale-badge">stale</span>}
                          </div>
                          {hashDiff && <div className="commit-entry-hash">{hashDiff}</div>}
                          {e.prompt_text && (
                            <div className="commit-entry-prompt">&ldquo;{e.prompt_text}&rdquo;</div>
                          )}
                          <div className="commit-entry-meta">
                            {e.agent_type && <span className="commit-entry-agent">{e.agent_type}</span>}
                            {e.observation_id != null && <span className="commit-entry-obs-id">obs #{e.observation_id}</span>}
                            {e.session_id && <span className="commit-entry-session" title={e.session_id}>session {e.session_id.slice(0, 8)}</span>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
