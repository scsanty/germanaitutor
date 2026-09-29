import { NextResponse } from 'next/server';
import { toPlacementErrorResponse } from '@/lib/services/placementService';

// The start, answer, and stop routes share one error mapping (not a route: only route.ts is).
export async function respondWithPlacementErrors(run: () => unknown): Promise<NextResponse> {
  try {
    return NextResponse.json(await run());
  } catch (err) {
    const mapped = toPlacementErrorResponse(err);
    if (mapped) return NextResponse.json(mapped.body, { status: mapped.status });
    throw err;
  }
}
