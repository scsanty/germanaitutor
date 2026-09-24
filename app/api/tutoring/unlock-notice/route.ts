import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { createUnlockService } from '@/lib/services/unlockService';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const action = body?.action;
  if (action !== 'switch' && action !== 'dismiss') {
    return NextResponse.json({ error: 'action must be "switch" or "dismiss"' }, { status: 400 });
  }
  return NextResponse.json(createUnlockService(getDb()).resolveUnlockNotice(action));
}
