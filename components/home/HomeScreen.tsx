'use client';

import { useState } from 'react';
import { HomeNotices } from './HomeNotices';
import { CurriculumTree } from '@/components/tutoring/CurriculumTree';

// Switching to an unlocked level changes which tree to show, so a notice action reloads it.
export function HomeScreen() {
  const [reloadKey, setReloadKey] = useState(0);
  return (
    <>
      <HomeNotices onChange={() => setReloadKey((key) => key + 1)} />
      <CurriculumTree reloadKey={reloadKey} />
    </>
  );
}
