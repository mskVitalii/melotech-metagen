import type { GenerateResponse, HistoryResponse, Platform } from './types';

export async function generateContent(
  prompt: string,
  targetPlatforms: Platform[],
): Promise<GenerateResponse> {
  const res = await fetch('/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, target_platforms: targetPlatforms }),
  });

  if (!res.ok) {
    const body: unknown = await res.json().catch(() => null);
    const message =
      typeof body === 'object' &&
      body !== null &&
      'message' in body &&
      typeof (body as { message?: unknown }).message === 'string'
        ? (body as { message: string }).message
        : `Request failed: ${res.status}`;

    throw new Error(message);
  }

  return res.json() as Promise<GenerateResponse>;
}

export async function fetchHistory(params: {
  page?: number;
  limit?: number;
  platform?: Platform | '';
}): Promise<HistoryResponse> {
  const search = new URLSearchParams();
  if (params.page) search.set('page', String(params.page));
  if (params.limit) search.set('limit', String(params.limit));
  if (params.platform) search.set('platform', params.platform);

  const query = search.toString();
  const res = await fetch(`/api/history${query ? `?${query}` : ''}`);

  if (!res.ok) {
    throw new Error(`Failed to fetch history: ${res.status}`);
  }

  return res.json() as Promise<HistoryResponse>;
}
