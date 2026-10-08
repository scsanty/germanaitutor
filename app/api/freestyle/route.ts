import { getDb } from '@/lib/db/client';
import { createFreestyleService } from '@/lib/services/freestyleService';
import { respond } from './respond';

export const dynamic = 'force-dynamic';

export async function GET() {
  return respond(() => createFreestyleService(getDb()).overview());
}
