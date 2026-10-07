import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { createFreestyleService } from '@/lib/services/freestyleService';
import { badRequest, modeOf, respond, type ModeProps } from '../../respond';

export const dynamic = 'force-dynamic';

export async function POST(request: Request, props: ModeProps) {
  const mode = await modeOf(props);
  if (mode instanceof NextResponse) return mode;
  const body = await request.json().catch(() => null);
  if (typeof body?.text !== 'string') return badRequest('text is required');
  return respond(async () => ({ messages: await createFreestyleService(getDb()).turn(mode, body.text) }));
}
