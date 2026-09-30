import { NextResponse } from 'next/server';
import { zipSync, strToU8 } from 'fflate';
import { getDb } from '@/lib/db/client';
import { isAdminSessionValid } from '@/lib/auth/adminSession';
import { createCurriculumExportService, CurriculumExportError } from '@/lib/services/curriculumExportService';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (!(await isAdminSessionValid())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  let files: Record<string, Uint8Array>;
  try {
    files = Object.fromEntries(
      createCurriculumExportService(getDb())
        .exportAll()
        .map(({ fileName, seed }) => [fileName, strToU8(`${JSON.stringify(seed, null, 2)}\n`)])
    );
  } catch (err) {
    if (err instanceof CurriculumExportError) return NextResponse.json({ error: err.message }, { status: 409 });
    throw err;
  }
  return new Response(zipSync(files), {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': 'attachment; filename="curriculum-seed.zip"',
    },
  });
}
