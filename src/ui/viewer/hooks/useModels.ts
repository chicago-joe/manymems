import { useState, useEffect, useCallback } from 'react';
import type { ModelStats } from '../types';
import { API_ENDPOINTS } from '../constants/api';
import { authFetch } from '../utils/api';

export function useModels() {
  const [models, setModels] = useState<ModelStats[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await authFetch(API_ENDPOINTS.MODELS_STATS);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setModels(data.models ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load models');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  return { models, isLoading, error, refresh };
}
