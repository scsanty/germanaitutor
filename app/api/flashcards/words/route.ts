import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { createDeckService, toDeckErrorResponse, type AddedWordSource } from '@/lib/services/deckService';
import { normalizeWord } from '@/lib/services/freestyleAi';
import { errorBody } from '@/lib/tutoring/errorCodes';

export const dynamic = 'force-dynamic';

const SOURCES: readonly string[] = ['freestyle', 'manual'];

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get('query') ?? '';
  return NextResponse.json(createDeckService(getDb()).listWords(query));
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const word = body?.word;
  const sentence = body?.sentence;
  const source = body?.source;
  if (
    typeof word !== 'string' ||
    !word.trim() ||
    (sentence !== undefined && sentence !== null && typeof sentence !== 'string') ||
    (source !== undefined && (typeof source !== 'string' || !SOURCES.includes(source)))
  ) {
    return NextResponse.json(errorBody('A word is required; sentence and source are optional', 'bad_request'), { status: 400 });
  }
  const db = getDb();
  const service = createDeckService(db, { normalize: (w, s) => normalizeWord(db, w, s) });
  try {
    return NextResponse.json(await service.addWord(word, sentence ?? null, (source as AddedWordSource | undefined) ?? 'freestyle'));
  } catch (err) {
    const mapped = toDeckErrorResponse(err);
    if (mapped) return NextResponse.json(mapped.body, { status: mapped.status });
    throw err;
  }
}
