import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { createFreestyleService } from '@/lib/services/freestyleService';
import { modeOf, respond, type ModeProps } from '../../respond';

export const dynamic = 'force-dynamic';

export async function POST(request: Request, props: ModeProps) {
  const mode = await modeOf(props);
  if (mode instanceof NextResponse) return mode;
  const body = await request.json().catch(() => null);
  return respond(async () => ({ summary: await createFreestyleService(getDb()).end(mode, { skipSummary: body?.skipSummary === true }) }));
}
