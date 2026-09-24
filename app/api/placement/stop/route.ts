import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { createPlacementService, toPlacementErrorResponse } from '@/lib/services/placementService';

export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    return NextResponse.json(createPlacementService(getDb()).stop());
  } catch (err) {
    const mapped = toPlacementErrorResponse(err);
    if (mapped) return NextResponse.json(mapped.body, { status: mapped.status });
    throw err;
  }
}
