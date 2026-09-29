import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { createPlacementService } from '@/lib/services/placementService';

export const dynamic = 'force-dynamic';

export async function GET() {
  const service = createPlacementService(getDb());
  return NextResponse.json({ best: service.getBestResult(), questionCount: service.questionCount() });
}
