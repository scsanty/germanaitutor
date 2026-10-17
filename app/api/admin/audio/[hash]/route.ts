import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { isAudioHash } from '@/lib/audio/audioStore';
import { createAudioService } from '@/lib/services/audioService';
import { findOwnedTranscript } from '@/lib/services/audioAdminService';
import { MAX_UPLOAD_BYTES } from '@/lib/audio/uploadLimit';
import { isUnreachableError, SpeechServiceError } from '@/lib/speech/speechProvider';
import { adminError, notAdmin, readJsonObject, unauthorized } from '../../adminResponses';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ hash: string }> };

const TOO_LARGE = 'The recording is larger than 20 MB';
const NOT_OWNED = 'No saved lesson exercise or set has this audio. Save the content first.';

// S21: only a hash that saved content owns; its job is (re)created from that content's transcript.
async function ownedHash(props: Props): Promise<{ hash: string; transcript: string } | NextResponse> {
  const { hash } = await props.params;
  if (!isAudioHash(hash)) return adminError('Invalid audio id', 400);
  const transcript = findOwnedTranscript(getDb(), hash);
  if (transcript === null) return adminError(NOT_OWNED, 404);
  return { hash, transcript };
}

// POST { replaceUpload? } → { status: 'queued' }. Review Focus 2: replacing an uploaded recording is
// an explicit, confirmed action, so without replaceUpload: true an upload is a 409.
export async function POST(request: Request, props: Props) {
  if (await notAdmin()) return unauthorized();
  const owned = await ownedHash(props);
  if (owned instanceof NextResponse) return owned;
  const body = (await readJsonObject(request)) ?? {};
  const db = getDb();
  const job = db.prepare('SELECT status FROM audio_jobs WHERE hash = ?').get(owned.hash) as { status: string } | undefined;
  if (job?.status === 'uploaded' && body.replaceUpload !== true) {
    return NextResponse.json({ error: 'This audio is an uploaded recording. Confirm to replace it with generated speech.', code: 'uploaded' }, { status: 409 });
  }
  const audio = createAudioService(db);
  audio.enqueue(owned.transcript);
  audio.regenerate(owned.hash);
  return NextResponse.json({ status: 'queued' });
}

// Reads the body up to `max` bytes; null when it is larger.
async function readCapped(request: Request, max: number): Promise<Buffer | null> {
  if (!request.body) return Buffer.alloc(0);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

// PUT <raw audio bytes> → { ok: true }. The recording is converted by the speech service and replaces
// the clip; the worker never renders over it.
export async function PUT(request: Request, props: Props) {
  if (await notAdmin()) return unauthorized();
  const declared = Number(request.headers.get('content-length') ?? NaN);
  if (Number.isFinite(declared) && declared > MAX_UPLOAD_BYTES) return adminError(TOO_LARGE, 413);
  const owned = await ownedHash(props);
  if (owned instanceof NextResponse) return owned;
  const data = await readCapped(request, MAX_UPLOAD_BYTES);
  if (data === null) return adminError(TOO_LARGE, 413);
  if (data.length === 0) return adminError('The recording is empty', 400);
  const audio = createAudioService(getDb());
  audio.enqueue(owned.transcript);
  try {
    await audio.upload(owned.hash, data);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (isUnreachableError(err)) return adminError(`The speech service is not reachable, so the recording can't be converted: ${message}`, 503);
    if (err instanceof SpeechServiceError) {
      return adminError(`The recording could not be converted: ${message}`, err.status === 413 ? 413 : err.status >= 400 && err.status < 500 ? 400 : 502);
    }
    throw err;
  }
  return NextResponse.json({ ok: true });
}
