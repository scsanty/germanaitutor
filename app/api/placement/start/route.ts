import { getDb } from '@/lib/db/client';
import { createPlacementService } from '@/lib/services/placementService';
import { respondWithPlacementErrors } from '../respond';

export const dynamic = 'force-dynamic';

export async function POST() {
  return respondWithPlacementErrors(() => createPlacementService(getDb()).start());
}
