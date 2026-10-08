import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { createFreestyleService } from '@/lib/services/freestyleService';
import { badRequest, modeOf, respond, type ModeProps } from '../../respond';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, props: ModeProps) {
  const mode = await modeOf(props);
  if (mode instanceof NextResponse) return mode;
  return respond(() => ({ session: createFreestyleService(getDb()).session(mode) }));
}

export async function POST(request: Request, props: ModeProps) {
  const mode = await modeOf(props);
  if (mode instanceof NextResponse) return mode;
  const body = await request.json().catch(() => null);
  const setup = body?.setup ?? {};
  if (typeof setup !== 'object' || setup === null || Array.isArray(setup)) return badRequest('setup must be an object');
  return respond(() => createFreestyleService(getDb()).start(mode, { level: body?.level, setup }));
}
