export function authFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return fetch(input, init);
}

export async function serverBetaFetch(
  path: string,
  settings: import('../types').Settings,
  init?: RequestInit
): Promise<Response> {
  const base = settings.CLAUDE_MEM_SERVER_BETA_URL?.replace(/\/$/, '');
  const key  = settings.CLAUDE_MEM_SERVER_BETA_API_KEY;
  if (!base || !key) throw new Error('Server beta not configured');
  return fetch(`${base}${path}`, {
    ...init,
    headers: { 'Authorization': `Bearer ${key}`, ...(init?.headers ?? {}) },
  });
}
