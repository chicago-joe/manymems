import { useState, useEffect, useCallback } from 'react';
import type { CommitRecord, ProvenanceEntry } from '../types';
import { API_ENDPOINTS } from '../constants/api';
import { authFetch } from '../utils/api';

export function useCommits() {
  const [commits, setCommits] = useState<CommitRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedSha, setExpandedSha] = useState<string | null>(null);
  const [detailCache, setDetailCache] = useState<Record<string, ProvenanceEntry[]>>({});
  const [detailLoading, setDetailLoading] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await authFetch(API_ENDPOINTS.PROVENANCE_COMMITS);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setCommits(data.commits ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load commits');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const toggleExpand = useCallback(async (sha: string) => {
    if (expandedSha === sha) {
      setExpandedSha(null);
      return;
    }
    setExpandedSha(sha);
    if (!detailCache[sha]) {
      setDetailLoading(sha);
      try {
        const res = await authFetch(`/api/provenance/by-commit?sha=${encodeURIComponent(sha)}`);
        if (res.ok) {
          const data = await res.json();
          setDetailCache(prev => ({ ...prev, [sha]: data.entries ?? [] }));
        }
      } finally {
        setDetailLoading(null);
      }
    }
  }, [expandedSha, detailCache]);

  return { commits, isLoading, error, refresh, expandedSha, toggleExpand, detailCache, detailLoading };
}
