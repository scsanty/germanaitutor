import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { createDeckService } from '@/lib/services/deckService';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(createDeckService(getDb()).getDeck());
}
