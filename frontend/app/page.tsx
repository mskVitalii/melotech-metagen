'use client';

import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { generateContent } from '../lib/api';
import type {
  GenerateResponse,
  Platform,
  PlatformOutput,
  SpotifyOutput,
  TikTokOutput,
  YouTubeOutput,
} from '../lib/types';

const PLATFORMS: { id: Platform; label: string; color: string }[] = [
  {
    id: 'spotify',
    label: 'Spotify',
    color: 'bg-green-500/20 border-green-500/40 text-green-300',
  },
  {
    id: 'tiktok',
    label: 'TikTok',
    color: 'bg-pink-500/20 border-pink-500/40 text-pink-300',
  },
  {
    id: 'youtube',
    label: 'YouTube',
    color: 'bg-red-500/20 border-red-500/40 text-red-300',
  },
];

function PlatformCard({
  platform,
  output,
}: {
  platform: string;
  output: PlatformOutput;
}) {
  const meta = PLATFORMS.find((p) => p.id === platform);
  const isFallback = 'fallback' in output && output.fallback;

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span
          className={`text-xs font-semibold px-2 py-1 rounded-full border ${meta?.color ?? 'bg-white/10 border-white/20 text-white'}`}
        >
          {platform.toUpperCase()}
        </span>
        {isFallback && (
          <span className="text-xs text-yellow-400 border border-yellow-400/30 px-2 py-0.5 rounded-full">
            fallback
          </span>
        )}
      </div>

      {platform === 'spotify' && (
        <SpotifyCard output={output as SpotifyOutput} />
      )}
      {platform === 'tiktok' && <TikTokCard output={output as TikTokOutput} />}
      {platform === 'youtube' && (
        <YouTubeCard output={output as YouTubeOutput} />
      )}
    </div>
  );
}

function SpotifyCard({ output }: { output: SpotifyOutput }) {
  return (
    <>
      <h3 className="text-lg font-semibold">{output.title}</h3>
      <div className="flex flex-wrap gap-2 text-sm">
        <Tag>{output.genre}</Tag>
        <Tag>{output.mood}</Tag>
        <Tag>{output.bpm} BPM</Tag>
      </div>
      <p className="text-sm text-white/70">{output.description}</p>
      <div className="text-xs text-white/50">
        <span className="font-medium text-white/70">Instruments: </span>
        {output.instruments.join(', ')}
      </div>
    </>
  );
}

function TikTokCard({ output }: { output: TikTokOutput }) {
  return (
    <>
      <p className="text-sm leading-relaxed">{output.hook}</p>
      <div className="flex flex-wrap gap-2">
        {output.hashtags.map((tag) => (
          <span
            key={tag}
            className="text-xs text-pink-300 bg-pink-500/10 px-2 py-0.5 rounded-full"
          >
            {tag}
          </span>
        ))}
      </div>
    </>
  );
}

function YouTubeCard({ output }: { output: YouTubeOutput }) {
  return (
    <>
      <h3 className="text-base font-semibold">{output.title}</h3>
      <p className="text-sm text-white/70">{output.description}</p>
      <div className="flex flex-wrap gap-1">
        {output.tags.map((tag) => (
          <span
            key={tag}
            className="text-xs text-red-300 bg-red-500/10 px-2 py-0.5 rounded-full"
          >
            {tag}
          </span>
        ))}
      </div>
    </>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="bg-white/10 text-white/80 px-2 py-0.5 rounded text-xs">
      {children}
    </span>
  );
}

export default function GeneratePage() {
  const [prompt, setPrompt] = useState('');
  const [selectedPlatforms, setSelectedPlatforms] = useState<Platform[]>([
    'spotify',
    'tiktok',
    'youtube',
  ]);
  const [result, setResult] = useState<GenerateResponse | null>(null);

  const mutation = useMutation({
    mutationFn: () => generateContent(prompt, selectedPlatforms),
    onSuccess: (data) => setResult(data),
  });
  const mutationErrorMessage =
    mutation.error instanceof Error ? mutation.error.message : null;

  function togglePlatform(platform: Platform) {
    setSelectedPlatforms((prev) =>
      prev.includes(platform)
        ? prev.filter((p) => p !== platform)
        : [...prev, platform],
    );
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!prompt.trim() || selectedPlatforms.length === 0) return;
    setResult(null);
    mutation.mutate();
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-10 flex flex-col gap-8">
      <div>
        <h1 className="text-3xl font-bold">Generate Platform Content</h1>
        <p className="text-white/50 mt-1 text-sm">
          Enter a music concept and get optimized content for every platform
          instantly.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Describe your track — e.g. 'Energetic synthwave for night driving with heavy bass'"
          maxLength={500}
          rows={3}
          className="w-full rounded-lg border border-white/15 bg-white/5 px-4 py-3 text-sm placeholder:text-white/30 focus:outline-none focus:border-violet-500/60 resize-none"
        />

        <div className="flex flex-wrap gap-2">
          {PLATFORMS.map(({ id, label, color }) => (
            <button
              key={id}
              type="button"
              onClick={() => togglePlatform(id)}
              className={`px-4 py-1.5 rounded-full border text-sm font-medium transition-opacity ${color} ${
                selectedPlatforms.includes(id) ? 'opacity-100' : 'opacity-30'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {mutationErrorMessage && (
          <p className="text-red-400 text-sm">{mutationErrorMessage}</p>
        )}

        <button
          type="submit"
          disabled={
            mutation.isPending ||
            !prompt.trim() ||
            selectedPlatforms.length === 0
          }
          className="self-start bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed text-white px-6 py-2 rounded-lg font-medium transition-colors"
        >
          {mutation.isPending ? 'Generating…' : 'Generate'}
        </button>
      </form>

      {result && (
        <section className="flex flex-col gap-4">
          <p className="text-xs text-white/40">
            Request ID: {result.requestId}
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Object.entries(result.results).map(([platform, output]) => (
              <PlatformCard
                key={platform}
                platform={platform}
                output={output}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
