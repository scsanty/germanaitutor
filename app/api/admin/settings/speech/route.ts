import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { getSetting } from '@/lib/services/appSettings';
import { DEFAULT_SPEECH_URL, getSpeechProvider, getSpeechUrl, saveSpeechUrl, SpeechUrlError } from '@/lib/speech/speechProvider';
import { sharedSpeechAvailability } from '@/lib/speech/speechAvailability';
import { adminError, notAdmin, readJsonObject, unauthorized } from '../../adminResponses';

export const dynamic = 'force-dynamic';

function display(url: string, isDefault: boolean) {
  return { url, defaultUrl: DEFAULT_SPEECH_URL, isDefault };
}

// GET → { url, defaultUrl, isDefault }; with ?check=1 also { health: { ok, voices } } for the saved address.
export async function GET(request: Request) {
  if (await notAdmin()) return unauthorized();
  const db = getDb();
  const url = getSpeechUrl(db);
  const body: Record<string, unknown> = display(url, !getSetting(db, 'speech_url'));
  if (new URL(request.url).searchParams.get('check') === '1') {
    const health = await getSpeechProvider(db).health();
    // The check is fresh, so the availability rules can use it straight away.
    sharedSpeechAvailability().record(url, health.ok);
    body.health = health;
  }
  return NextResponse.json(body);
}

// PUT { url } → the saved address. An empty url goes back to the default.
export async function PUT(request: Request) {
  if (await notAdmin()) return unauthorized();
  const body = await readJsonObject(request);
  if (!body || typeof body.url !== 'string') return adminError('Send { url }', 400);
  try {
    const db = getDb();
    const url = saveSpeechUrl(db, body.url);
    return NextResponse.json(display(url, !getSetting(db, 'speech_url')));
  } catch (err) {
    if (err instanceof SpeechUrlError) return adminError(err.message, 400);
    throw err;
  }
}
