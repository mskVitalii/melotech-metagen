// Shared types mirroring backend response shapes

export type SpotifyOutput = {
  title: string;
  genre: string;
  mood: string;
  bpm: number;
  instruments: string[];
  description: string;
  fallback?: true;
};

export type TikTokOutput = {
  hook: string;
  hashtags: string[];
  fallback?: true;
};

export type YouTubeOutput = {
  title: string;
  description: string;
  tags: string[];
  fallback?: true;
};

export type PlatformOutput = SpotifyOutput | TikTokOutput | YouTubeOutput;

export type GenerateResponse = {
  requestId: string;
  results: Record<string, PlatformOutput>;
};

export type HistoryResultItem = {
  platform: string;
  payload: unknown;
};

export type HistoryItem = {
  id: string;
  prompt: string;
  createdAt: string;
  results: HistoryResultItem[];
};

export type HistoryResponse = {
  data: HistoryItem[];
  total: number;
  page: number;
  limit: number;
};

export type Platform = 'spotify' | 'tiktok' | 'youtube';
