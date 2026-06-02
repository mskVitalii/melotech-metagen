import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: 'Melotech Metagen',
  description:
    'Generate platform-specific music marketing content from a single prompt',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <header className="border-b border-white/10 px-6 py-4 flex items-center gap-6">
            <Link
              href="/"
              className="text-lg font-bold text-violet-400 hover:text-violet-300"
            >
              Melotech Metagen
            </Link>
            <nav className="flex gap-4 text-sm text-white/60">
              <Link href="/" className="hover:text-white transition-colors">
                Generate
              </Link>
              <Link
                href="/history"
                className="hover:text-white transition-colors"
              >
                History
              </Link>
            </nav>
          </header>
          <main className="min-h-screen">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
