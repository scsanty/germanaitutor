import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { createPlacementService } from '@/lib/services/placementService';

export const dynamic = 'force-dynamic';

export async function POST() {
  return NextResponse.json(createPlacementService(getDb()).skip());
}
