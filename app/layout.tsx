import type { ReactNode } from 'react';
import { join } from 'node:path';
import { getDb } from '@/lib/db/client';
import { loadSeedIfNeeded } from '@/lib/services/curriculumSeedLoader';

loadSeedIfNeeded(getDb(), join(process.cwd(), 'data', 'curriculum-seed'));

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
