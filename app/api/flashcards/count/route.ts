import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { createDeckService } from '@/lib/services/deckService';

export const dynamic = 'force-dynamic';

// The deck badge: cards still to review today (already capped by the deck review limit).
export async function GET() {
  return NextResponse.json({ due: createDeckService(getDb()).dueCount() });
}
