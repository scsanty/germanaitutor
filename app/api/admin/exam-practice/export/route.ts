import { NextResponse } from 'next/server';
import { stringify as stringifyYaml } from 'yaml';
import { getDb } from '@/lib/db/client';
import { createTeilSetService, toTeilSetErrorResponse } from '@/lib/services/teilSetService';
import { badRequest, notAdmin, unauthorized } from '../respond';

export const dynamic = 'force-dynamic';

// GET ?formatId&partId&format=json|yaml → the part's sets (not rejected or reserved) as a bundle file.
export async function GET(request: Request) {
  if (await notAdmin()) return unauthorized();
  const params = new URL(request.url).searchParams;
  const formatId = params.get('formatId');
  const partId = params.get('partId');
  const format = params.get('format') ?? 'json';
  if (!formatId || !partId) return badRequest('formatId and partId are required');
  if (format !== 'json' && format !== 'yaml') return badRequest('format must be json or yaml');
  let bundle;
  try {
    bundle = createTeilSetService(getDb()).exportPart(formatId, partId);
  } catch (err) {
    const mapped = toTeilSetErrorResponse(err);
    if (mapped) return NextResponse.json(mapped.body, { status: mapped.status });
    throw err;
  }
  // The ids passed readFormat's pattern and matched a real part, so they are safe in a file name.
  const text = format === 'json' ? `${JSON.stringify(bundle, null, 2)}\n` : stringifyYaml(bundle);
  return new Response(text, {
    headers: {
      'Content-Type': format === 'json' ? 'application/json' : 'application/yaml',
      'Content-Disposition': `attachment; filename="${formatId}__${partId}.${format}"`,
    },
  });
}
