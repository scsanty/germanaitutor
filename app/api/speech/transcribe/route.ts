import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { declaresMoreThan, readCappedBody } from '@/lib/http/readCappedBody';
import { isValidScope, MAX_UPLOAD_BYTES } from '@/lib/speech/clips';
import { createSpeechClipService } from '@/lib/services/speechClipService';
import { errorBody } from '@/lib/tutoring/errorCodes';
import { badRequest, respond } from '../respond';

export const dynamic = 'force-dynamic';

const TOO_LARGE = 'That recording is too large';

// POST ?scope=… with the raw recording as the body → { clipId, text, words, duration }.
export async function POST(request: Request) {
  const scope = new URL(request.url).searchParams.get('scope');
  if (!isValidScope(scope)) return badRequest('Invalid scope');
  const tooLarge = () => NextResponse.json(errorBody(TOO_LARGE, 'bad_request'), { status: 413 });
  if (declaresMoreThan(request, MAX_UPLOAD_BYTES)) return tooLarge();
  const audio = await readCappedBody(request, MAX_UPLOAD_BYTES);
  if (audio === null) return tooLarge();
  if (audio.length === 0) return badRequest('The recording is empty');
  return respond(() => createSpeechClipService(getDb()).transcribeForScope(scope, audio, request.headers.get('content-type')));
}
