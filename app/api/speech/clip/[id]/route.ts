import { NextResponse } from 'next/server';
import { readFileSync } from 'node:fs';
import { getDb } from '@/lib/db/client';
import { contentTypeFor } from '@/lib/speech/clips';
import { createSpeechClipService } from '@/lib/services/speechClipService';
import { errorBody } from '@/lib/tutoring/errorCodes';

export const dynamic = 'force-dynamic';

// The audio of a student or partner clip (replay during feedback). Never cached: it is deleted with its scope.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
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
  return new NextResponse(new Uint8Array(audio), {
    headers: { 'Content-Type': contentTypeFor(clip.path), 'Cache-Control': 'no-store' },
  });
}
