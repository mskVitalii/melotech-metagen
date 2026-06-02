// D-04: Spotify platform output shape
export interface SpotifyOutput {
  title: string;
  genre: string;
  mood: string;
  bpm: number;
  instruments: string[];
  description: string;
}

// D-05: TikTok platform output shape (exactly 3 hashtags)
export interface TikTokOutput {
  hook: string;
  hashtags: string[];
}

// D-06: YouTube platform output shape
export interface YouTubeOutput {
  title: string;
  description: string;
  tags: string[];
}

// D-13: Union of all platform outputs with optional fallback flag
export type PlatformOutput = (SpotifyOutput | TikTokOutput | YouTubeOutput) & {
  fallback?: true;
};
