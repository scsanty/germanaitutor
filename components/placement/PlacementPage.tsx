'use client';

import { useRouter } from 'next/navigation';
import { PlacementTest } from './PlacementTest';

export function PlacementPage() {
  const router = useRouter();
  return <PlacementTest onFinished={() => router.push('/')} />;
}
