import React, { useState } from 'react';
import type { CommitRecord } from '../types';

interface CheckpointFeedProps {
  commits: CommitRecord[];
  onFileClick?: (filePath: string) => void;
}

function formatEpoch(epoch: number): string {
  const d = new Date(epoch * 1000);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) + '…' : text;
}

export function CheckpointFeed({ commits, onFileClick }: CheckpointFeedProps) {
  const [expandedSha, setExpandedSha] = useState<string | null>(null);

  if (commits.length === 0) {
    return (
      <div className="checkpoint-empty">
        No commits yet. Make some edits and push to see your history here.
      </div>
    );
  }

  return (
    <div className="checkpoint-feed">
      {commits.map(commit => {
        const isExpanded = expandedSha === commit.commit_sha;
        const sha = commit.commit_sha.slice(0, 8);
        const date = formatEpoch(commit.earliest_epoch);
        const preview = commit.prompt_preview ? truncate(commit.prompt_preview, 120) : null;

        return (
          <div
            key={commit.commit_sha}
            className="checkpoint-row"
            onClick={() => setExpandedSha(isExpanded ? null : commit.commit_sha)}
          >
            <div className="checkpoint-header">
              <span className="sha-chip">{sha}</span>
              <span style={{ fontSize: '11px', color: 'var(--mm-text-muted)' }}>{date}</span>
              {commit.models.map(model => (
                <span key={model} className="checkpoint-model-badge">{model}</span>
              ))}
            </div>

            {preview && (
              <div className="checkpoint-prompt">{preview}</div>
            )}

            {isExpanded && (
              <>
                {commit.files.length > 0 && (
                  <div className="checkpoint-files">
                    {commit.files.map(f => (
                      <span
                        key={f}
                        className="checkpoint-file-chip"
                        onClick={e => {
                          e.stopPropagation();
                          onFileClick?.(f);
                        }}
                      >
                        {f}
                      </span>
                    ))}
                  </div>
                )}
                <div className="checkpoint-meta">
                  {commit.session_count} session{commit.session_count !== 1 ? 's' : ''}
                  {commit.edit_count > 0 && ` · ${commit.edit_count} edits`}
                  {commit.actors.length > 0 && ` · ${commit.actors.join(', ')}`}
                </div>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
