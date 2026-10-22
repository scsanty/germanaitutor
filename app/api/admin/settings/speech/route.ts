import type Database from 'better-sqlite3';
import { NextResponse } from 'next/server';
import { whisperModel } from '@/lib/services/speechClipService';
import { getDb } from '@/lib/db/client';
import { getSetting, setSetting } from '@/lib/services/appSettings';
import { DEFAULT_SPEECH_URL, getSpeechProvider, getSpeechUrl, saveSpeechUrl, SpeechUrlError } from '@/lib/speech/speechProvider';
import { sharedSpeechAvailability } from '@/lib/speech/speechAvailability';
import { adminError, notAdmin, readJsonObject, unauthorized } from '../../adminResponses';

export const dynamic = 'force-dynamic';

function display(db: Database.Database, url: string, isDefault: boolean) {
  return { url, defaultUrl: DEFAULT_SPEECH_URL, isDefault, whisperModel: whisperModel(db) };
}

// GET → { url, defaultUrl, isDefault, whisperModel }; with ?check=1 also { health: { ok, voices } } for the saved address.
export async function GET(request: Request) {
  if (await notAdmin()) return unauthorized();
  const db = getDb();
  const url = getSpeechUrl(db);
  const body: Record<string, unknown> = display(db, url, !getSetting(db, 'speech_url'));
  if (new URL(request.url).searchParams.get('check') === '1') {
    const health = await getSpeechProvider(db).health();
    // The check is fresh, so the availability rules can use it straight away.
    sharedSpeechAvailability().record(url, health.ok);
    body.health = health;
  }
  return NextResponse.json(body);
}

// PUT { url?, whisperModel? } → the saved settings. An empty url goes back to the default.
export async function PUT(request: Request) {
  if (await notAdmin()) return unauthorized();
  const body = await readJsonObject(request);
  const hasUrl = body !== null && body.url !== undefined;
  const hasModel = body !== null && body.whisperModel !== undefined;
  if (!body || (!hasUrl && !hasModel) || (hasUrl && typeof body.url !== 'string')) return adminError('Send { url } or { whisperModel }', 400);
  if (hasModel && body.whisperModel !== 'small' && body.whisperModel !== 'medium') return adminError('The speech model must be small or medium', 400);
  try {
    const db = getDb();
    const url = hasUrl ? saveSpeechUrl(db, body.url as string) : getSpeechUrl(db);
    if (hasModel) setSetting(db, 'whisper_model', body.whisperModel as string);
    return NextResponse.json(display(db, url, !getSetting(db, 'speech_url')));
  } catch (err) {
    if (err instanceof SpeechUrlError) return adminError(err.message, 400);
    throw err;
  }
}
