import { useState, useEffect, useCallback } from 'react';
import type { TeamInfo, TeamMember, ApiKeyInfo, Settings } from '../types';
import { serverBetaFetch } from '../utils/api';

export function useTeams(settings: Settings) {
  const [teams, setTeams] = useState<TeamInfo[]>([]);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [apiKeys, setApiKeys] = useState<ApiKeyInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!settings.CLAUDE_MEM_SERVER_BETA_URL) return;
    setIsLoading(true);
    setError(null);
    try {
      const [teamsRes, apiKeysRes] = await Promise.all([
        serverBetaFetch('/v1/teams', settings),
        serverBetaFetch('/v1/api-keys', settings),
      ]);
      if (!teamsRes.ok) throw new Error(`Teams HTTP ${teamsRes.status}`);
      if (!apiKeysRes.ok) throw new Error(`API Keys HTTP ${apiKeysRes.status}`);

      const teamsData: TeamInfo[] = await teamsRes.json();
      const apiKeysData: ApiKeyInfo[] = await apiKeysRes.json();

      setTeams(teamsData);
      setApiKeys(apiKeysData);

      if (teamsData.length > 0) {
        const membersRes = await serverBetaFetch(`/v1/teams/${teamsData[0].id}/members`, settings);
        if (!membersRes.ok) throw new Error(`Members HTTP ${membersRes.status}`);
        const membersData: TeamMember[] = await membersRes.json();
        setMembers(membersData);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load teams');
    } finally {
      setIsLoading(false);
    }
  }, [settings]);

  useEffect(() => { refresh(); }, [refresh]);

  return { teams, members, apiKeys, isLoading, error, refresh };
}
