import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { isAdminSessionValid } from '@/lib/auth/adminSession';
import { createPlacementService } from '@/lib/services/placementService';
import { parsePlacementExam, serializePlacementExam, type ExamFormat } from '@/lib/tutoring/placementExamFormat';

export const dynamic = 'force-dynamic';

function formatFrom(request: Request): ExamFormat | null {
  const format = new URL(request.url).searchParams.get('format') ?? 'json';
  return format === 'json' || format === 'yaml' ? format : null;
}

export async function GET(request: Request) {
  if (!isAdminSessionValid()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const format = formatFrom(request);
  if (!format) return NextResponse.json({ error: 'format must be json or yaml' }, { status: 400 });
  const text = serializePlacementExam(createPlacementService(getDb()).getExam(), format);
  return new Response(text, {
    headers: {
      'Content-Type': format === 'json' ? 'application/json' : 'application/yaml',
      'Content-Disposition': `attachment; filename="placement-exam.${format}"`,
    },
  });
}

export async function PUT(request: Request) {
  if (!isAdminSessionValid()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const format = formatFrom(request);
  if (!format) return NextResponse.json({ errors: ['format must be json or yaml'] }, { status: 400 });
  const parsed = parsePlacementExam(await request.text(), format);
  if (!parsed.ok) return NextResponse.json({ errors: parsed.errors }, { status: 400 });
  const service = createPlacementService(getDb());
  service.replaceExam(parsed.questions);
  return NextResponse.json({ ok: true, questionCount: service.questionCount() });
}
