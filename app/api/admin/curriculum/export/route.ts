import { NextResponse } from 'next/server';
import { zipSync, strToU8 } from 'fflate';
import { getDb } from '@/lib/db/client';
import { isAdminSessionValid } from '@/lib/auth/adminSession';
import { createCurriculumExportService } from '@/lib/services/curriculumExportService';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (!isAdminSessionValid()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const files = Object.fromEntries(
    createCurriculumExportService(getDb())
      .exportAll()
      .map(({ fileName, seed }) => [fileName, strToU8(`${JSON.stringify(seed, null, 2)}\n`)])
  );
  return new Response(zipSync(files), {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': 'attachment; filename="curriculum-seed.zip"',
    },
  });
}
