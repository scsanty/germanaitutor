import { NextResponse } from 'next/server';
import { readFileSync } from 'node:fs';
import { getDb } from '@/lib/db/client';
import { parseRange } from '@/lib/http/byteRange';
import { contentTypeFor } from '@/lib/speech/clips';
import { createSpeechClipService } from '@/lib/services/speechClipService';
import { errorBody } from '@/lib/tutoring/errorCodes';

export const dynamic = 'force-dynamic';

// The audio of a student or partner clip (replay during feedback). Never cached: it is deleted with its scope.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const clip = createSpeechClipService(getDb()).getClip(id);
  let audio: Buffer | null = null;
  if (clip?.path) {
    try {
      audio = readFileSync(clip.path);
    } catch {
      audio = null; // deleted between the lookup and the read
    }
  }
  if (!clip?.path || !audio) return NextResponse.json(errorBody('Clip not found', 'not_found'), { status: 404 });
  const headers: Record<string, string> = { 'Content-Type': contentTypeFor(clip.path), 'Cache-Control': 'no-store', 'Accept-Ranges': 'bytes' };
  const range = parseRange(request.headers.get('range'), audio.length);
  if (range === 'unsatisfiable') return new NextResponse(null, { status: 416, headers: { ...headers, 'Content-Range': `bytes */${audio.length}` } });
  if (range) {
    const part = audio.subarray(range.start, range.end + 1);
    return new NextResponse(new Uint8Array(part), {
      status: 206,
      headers: { ...headers, 'Content-Range': `bytes ${range.start}-${range.end}/${audio.length}`, 'Content-Length': String(part.length) },
    });
  }
  return new NextResponse(new Uint8Array(audio), { headers });
}
