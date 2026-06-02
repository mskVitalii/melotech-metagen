'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { use } from 'react';
import { fetchHistory } from '../../../lib/api';
import type {
  SpotifyOutput,
  TikTokOutput,
  YouTubeOutput,
} from '../../../lib/types';

// History detail: fetches all history and finds the item by id.
// In v2 this would be a dedicated GET /history/:id endpoint.

function PlatformDetail({
  platform,
  payload,
}: {
  platform: string;
  payload: unknown;
}) {
  const payloadRecord = payload as Record<string, unknown>;
  const isFallback = Boolean(
    'fallback' in payloadRecord && payloadRecord.fallback,
  );

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-5 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold px-2 py-1 rounded-full border border-white/20 bg-white/10">
          {platform.toUpperCase()}
        </span>
        {isFallback && (
          <span className="text-xs text-yellow-400 border border-yellow-400/30 px-2 py-0.5 rounded-full">
            fallback
          </span>
        )}
      </div>

      {platform === 'spotify' && (
        <SpotifyDetail output={payload as SpotifyOutput} />
      )}
      {platform === 'tiktok' && (
        <TikTokDetail output={payload as TikTokOutput} />
      )}
      {platform === 'youtube' && (
        <YouTubeDetail output={payload as YouTubeOutput} />
      )}
    </div>
  );
}

function SpotifyDetail({ output }: { output: SpotifyOutput }) {
  return (
    <>
      <h2 className="text-lg font-semibold">{output.title}</h2>
      <div className="flex flex-wrap gap-2 text-sm">
        <span className="bg-white/10 px-2 py-0.5 rounded text-xs">
          {output.genre}
        </span>
        <span className="bg-white/10 px-2 py-0.5 rounded text-xs">
          {output.mood}
        </span>
        <span className="bg-white/10 px-2 py-0.5 rounded text-xs">
          {output.bpm} BPM
        </span>
      </div>
      <p className="text-sm text-white/70">{output.description}</p>
      <p className="text-xs text-white/50">
        <span className="text-white/70 font-medium">Instruments: </span>
        {output.instruments.join(', ')}
      </p>
    </>
  );
}

function TikTokDetail({ output }: { output: TikTokOutput }) {
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

function YouTubeDetail({ output }: { output: YouTubeOutput }) {
  return (
    <>
      <h2 className="text-base font-semibold">{output.title}</h2>
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

export default function HistoryDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  // Fetch first page with large limit to find the item — v2 should have /history/:id
  const { data, isLoading, isError } = useQuery({
    queryKey: ['history-detail', id],
    queryFn: () => fetchHistory({ limit: 100 }),
    select: (res) => res.data.find((item) => item.id === id),
  });

  return (
    <div className="max-w-4xl mx-auto px-6 py-10 flex flex-col gap-6">
      <Link
        href="/history"
        className="text-sm text-white/40 hover:text-white transition-colors"
      >
        ← Back to History
      </Link>

      {isLoading && (
        <div className="text-center py-20 text-white/40">Loading…</div>
      )}

      {isError && <div className="text-red-400 text-sm">Failed to load.</div>}

      {data === undefined && !isLoading && !isError && (
        <div className="text-white/40">Generation not found.</div>
      )}

      {data && (
        <>
          <div>
            <p className="text-xs text-white/30 mb-2">
              {new Date(data.createdAt).toLocaleString()} · ID: {data.id}
            </p>
            <blockquote className="border-l-2 border-violet-500 pl-4 text-white/80 italic">
              {data.prompt}
            </blockquote>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {data.results.map((r) => (
              <PlatformDetail
                key={r.platform}
                platform={r.platform}
                payload={r.payload}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
