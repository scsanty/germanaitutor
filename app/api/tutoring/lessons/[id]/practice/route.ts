import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { createPracticeService, toPracticeErrorResponse } from '@/lib/services/practiceService';

export const dynamic = 'force-dynamic';

export async function POST(_request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    return NextResponse.json(await createPracticeService(getDb()).serveBatch(params.id));
  } catch (err) {
    const mapped = toPracticeErrorResponse(err);
    if (mapped) return NextResponse.json(mapped.body, { status: mapped.status });
    throw err;
  }
}
