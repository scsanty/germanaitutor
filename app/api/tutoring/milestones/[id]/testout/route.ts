import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { createTestOutService, toTestOutErrorResponse } from '@/lib/services/testOutService';

export const dynamic = 'force-dynamic';

function mapError(err: unknown) {
  const mapped = toTestOutErrorResponse(err);
  if (mapped) return NextResponse.json(mapped.body, { status: mapped.status });
  throw err;
}

export async function GET(_request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    return NextResponse.json(createTestOutService(getDb()).state(params.id));
  } catch (err) {
    return mapError(err);
  }
}

export async function POST(_request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    return NextResponse.json(createTestOutService(getDb()).start(params.id));
  } catch (err) {
    return mapError(err);
  }
}
