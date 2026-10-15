import { parse as parseYaml } from 'yaml';
import { getDb } from '@/lib/db/client';
import { createTeilSetService } from '@/lib/services/teilSetService';
import type { TeilSetContent } from '@/lib/exam/teilSets';
import { badRequest, notAdmin, readBody, respond, unauthorized } from './respond';

export const dynamic = 'force-dynamic';

// GET ?formatId&partId → TeilSetRow[]. An unknown format or part is a 404 from the service (S1).
export async function GET(request: Request) {
  if (await notAdmin()) return unauthorized();
  const params = new URL(request.url).searchParams;
  const formatId = params.get('formatId');
  const partId = params.get('partId');
  if (!formatId || !partId) return badRequest('formatId and partId are required');
  return respond(() => createTeilSetService(getDb()).list(formatId, partId));
}

type UploadEntry = { id: string; set: TeilSetContent };

// The download's bundle shape ({ formatId, partId, version, sets }) or a bare list of { id, set }.
function setsFrom(data: unknown, formatId: string, partId: string): UploadEntry[] | string {
  if (Array.isArray(data)) return data as UploadEntry[];
  if (typeof data !== 'object' || data === null) return 'The file must hold a list of sets or a { sets } object';
  const bundle = data as Record<string, unknown>;
  if (bundle.formatId !== undefined && bundle.formatId !== formatId) return `The file is for ${String(bundle.formatId)}, not ${formatId}`;
  if (bundle.partId !== undefined && bundle.partId !== partId) return `The file is for part ${String(bundle.partId)}, not ${partId}`;
  return Array.isArray(bundle.sets) ? (bundle.sets as UploadEntry[]) : 'The file has no sets list';
}

// PUT { formatId, partId, format: 'json' | 'yaml', text } → { count }; any bad set rejects the whole upload.
export async function PUT(request: Request) {
  if (await notAdmin()) return unauthorized();
  const body = await readBody(request);
  const { formatId, partId, format, text } = body ?? {};
  if (typeof formatId !== 'string' || typeof partId !== 'string' || typeof text !== 'string') {
    return badRequest('Send { formatId, partId, format, text }');
  }
  if (format !== 'json' && format !== 'yaml') return badRequest('format must be json or yaml');
  let data: unknown;
  try {
    data = format === 'json' ? JSON.parse(text) : parseYaml(text);
  } catch (err) {
    return badRequest(`The file is not valid ${format.toUpperCase()}: ${(err as Error).message}`);
  }
  const sets = setsFrom(data, formatId, partId);
  if (typeof sets === 'string') return badRequest(sets);
  return respond(() => createTeilSetService(getDb()).upload(formatId, partId, sets));
}
