import type { NextConfig } from 'next';

const backendInternalUrl =
  process.env.BACKEND_INTERNAL_URL ?? 'http://localhost:3001';

const nextConfig: NextConfig = {
  rewrites: () =>
    Promise.resolve([
      {
        source: '/api/:path*',
        destination: `${backendInternalUrl}/:path*`,
      },
    ]),
};

export default nextConfig;
