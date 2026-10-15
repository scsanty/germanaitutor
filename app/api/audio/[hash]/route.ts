import { getDb } from '@/lib/db/client';
import { isAudioHash, statAudio } from '@/lib/audio/audioStore';
import { createAudioService } from '@/lib/services/audioService';
import { errorBody } from '@/lib/tutoring/errorCodes';

export const dynamic = 'force-dynamic';

// S13: an upload or a regenerate replaces the bytes behind the same URL, so the browser must revalidate
// (no-cache) and the ETag (size and mtime) lets an unchanged clip answer 304.
function etagOf(stat: { size: number; mtimeMs: number }): string {
  return `"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`;
}

function matches(ifNoneMatch: string | null, etag: string): boolean {
  if (!ifNoneMatch) return false;
  return ifNoneMatch.split(',').some((t) => {
    const tag = t.trim().replace(/^W\//, '');
    return tag === '*' || tag === etag;
  });
}

// S14: Safari's <audio> asks for byte ranges. One range is served (start-end, start-, -suffix);
// a multi-range or malformed header gets the whole file, an unsatisfiable one 416.
function parseRange(header: string | null, size: number): { start: number; end: number } | 'unsatisfiable' | null {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m || (m[1] === '' && m[2] === '')) return null;
  let start: number;
  let end: number;
  if (m[1] === '') {
    const suffix = Number(m[2]);
    if (suffix === 0) return 'unsatisfiable';
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1);
    if (m[2] !== '' && Number(m[2]) < start) return null;
  }
  if (start >= size || size === 0) return 'unsatisfiable';
  return { start, end };
}

export async function GET(request: Request, props: { params: Promise<{ hash: string }> }) {
  const { hash } = await props.params;
  if (!isAudioHash(hash)) return Response.json(errorBody('Invalid audio id', 'bad_request'), { status: 400 });

  const known = statAudio(hash);
  if (known && matches(request.headers.get('if-none-match'), etagOf(known))) {
    return new Response(null, { status: 304, headers: { ETag: etagOf(known), 'Cache-Control': 'private, no-cache' } });
  }

  const buf = await createAudioService(getDb()).getOrRender(hash);
  if (!buf) return Response.json(errorBody('This audio is not available right now', 'audio_unavailable'), { status: 503 });

  const stat = statAudio(hash);
  const headers: Record<string, string> = {
    'Content-Type': 'audio/ogg',
    'Cache-Control': 'private, no-cache',
    'Accept-Ranges': 'bytes',
  };
  if (stat && stat.size === buf.length) headers.ETag = etagOf(stat);

  const range = parseRange(request.headers.get('range'), buf.length);
  if (range === 'unsatisfiable') {
    return new Response(null, { status: 416, headers: { ...headers, 'Content-Range': `bytes */${buf.length}` } });
  }
  if (range) {
    const part = buf.subarray(range.start, range.end + 1);
    return new Response(new Uint8Array(part), {
      status: 206,
      headers: { ...headers, 'Content-Range': `bytes ${range.start}-${range.end}/${buf.length}`, 'Content-Length': String(part.length) },
    });
  }
  return new Response(new Uint8Array(buf), { headers: { ...headers, 'Content-Length': String(buf.length) } });
}
