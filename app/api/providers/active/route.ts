import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { defaultKeyFilePath } from '@/lib/crypto/keyfile';
import { createProviderService } from '@/lib/services/providerService';

export const dynamic = 'force-dynamic';

export async function GET() {
  const service = createProviderService(getDb(), defaultKeyFilePath());
  return NextResponse.json(service.getActiveConnection());
}

export async function PUT(request: Request) {
  const { id } = await request.json();
  const service = createProviderService(getDb(), defaultKeyFilePath());
  service.setActiveConnection(id);
  return NextResponse.json(service.getActiveConnection());
}
