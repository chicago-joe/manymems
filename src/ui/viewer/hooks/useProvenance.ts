import { useState, useEffect, useCallback } from 'react';
import type { ProvenanceEntry } from '../types';
import { API_ENDPOINTS } from '../constants/api';
import { authFetch } from '../utils/api';

export interface ProvenanceTarget {
  file: string;
  line: number;
}

export function useProvenance() {
  const [target, setTarget] = useState<ProvenanceTarget | null>(null);
  const [entries, setEntries] = useState<ProvenanceEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!target) {
      setEntries([]);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    authFetch(`${API_ENDPOINTS.PROVENANCE_BY_LINE}?file=${encodeURIComponent(target.file)}&line=${target.line}`)
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then(data => {
        if (cancelled) return;
        // by-line returns MCP content shape: {content: [{type:'text', text: JSON}]}
        const text = data?.content?.[0]?.text;
        const result = text ? JSON.parse(text) : data;
        setEntries(result?.provenance ?? result?.records ?? []);
      })
      .catch(err => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => { cancelled = true; };
  }, [target]);

  const open = useCallback((t: ProvenanceTarget) => setTarget(t), []);
  const close = useCallback(() => setTarget(null), []);

  return { target, entries, isLoading, error, open, close };
}
