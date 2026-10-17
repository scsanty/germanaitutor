import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { audioStatusFor, AudioTranscriptError } from '@/lib/services/audioAdminService';
import { adminError, notAdmin, readJsonObject, unauthorized } from '../adminResponses';

export const dynamic = 'force-dynamic';

// POST { transcript } → AdminAudioStatus: the clip's hash, job status, whether the file exists, and
// whether saved content owns it. The editors use it to show Regenerate and Upload.
export async function POST(request: Request) {
  if (await notAdmin()) return unauthorized();
  const body = await readJsonObject(request);
  if (!body || typeof body.transcript !== 'string') return adminError('Send { transcript }', 400);
  try {
    return NextResponse.json(audioStatusFor(getDb(), body.transcript));
  } catch (err) {
    if (err instanceof AudioTranscriptError) return adminError(err.message, 400);
    throw err;
  }
}
