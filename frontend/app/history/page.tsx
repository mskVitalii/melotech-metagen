'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { fetchHistory } from '../../lib/api';
import type { Platform } from '../../lib/types';

const PLATFORMS: { id: Platform | ''; label: string }[] = [
  { id: '', label: 'All platforms' },
  { id: 'spotify', label: 'Spotify' },
  { id: 'tiktok', label: 'TikTok' },
  { id: 'youtube', label: 'YouTube' },
];

const PAGE_SIZE = 10;

export default function HistoryPage() {
  const [page, setPage] = useState(1);
  const [platform, setPlatform] = useState<Platform | ''>('');

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['history', page, platform],
    queryFn: () => fetchHistory({ page, limit: PAGE_SIZE, platform }),
  });

  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 0;
  const errorMessage =
    error instanceof Error ? error.message : 'Failed to load history';

  function handlePlatformChange(p: Platform | '') {
    setPlatform(p);
    setPage(1);
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-10 flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold">History</h1>
        <p className="text-white/50 mt-1 text-sm">
          Previous generation requests
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        {PLATFORMS.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => handlePlatformChange(id)}
            className={`px-3 py-1 rounded-full border text-sm transition-colors ${
              platform === id
                ? 'bg-violet-600 border-violet-500 text-white'
                : 'border-white/15 text-white/50 hover:text-white hover:border-white/30'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {isLoading && (
        <div className="text-center py-20 text-white/40">Loading…</div>
      )}

      {isError && <div className="text-red-400 text-sm">{errorMessage}</div>}

      {data && data.data.length === 0 && (
        <div className="text-center py-20 text-white/40">
          No generations found.
        </div>
      )}

      {data && data.data.length > 0 && (
        <>
          <ul className="flex flex-col gap-3">
            {data.data.map((item) => (
              <li key={item.id}>
                <Link
                  href={`/history/${item.id}`}
                  className="block rounded-xl border border-white/10 bg-white/5 hover:bg-white/8 px-5 py-4 transition-colors group"
                >
                  <div className="flex items-start justify-between gap-4">
                    <p className="text-sm text-white/90 line-clamp-2">
                      {item.prompt}
                    </p>
                    <time className="text-xs text-white/30 shrink-0">
                      {new Date(item.createdAt).toLocaleDateString()}
                    </time>
                  </div>
                  <div className="flex gap-1.5 mt-2">
                    {item.results.map((r) => (
                      <span
                        key={r.platform}
                        className="text-xs px-2 py-0.5 rounded-full bg-white/10 text-white/50"
                      >
                        {r.platform}
                      </span>
                    ))}
                  </div>
                </Link>
              </li>
            ))}
          </ul>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-white/40">
                {data.total} total · page {page} of {totalPages}
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-3 py-1 rounded border border-white/15 disabled:opacity-30 hover:border-white/30 transition-colors"
                >
                  Prev
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="px-3 py-1 rounded border border-white/15 disabled:opacity-30 hover:border-white/30 transition-colors"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
