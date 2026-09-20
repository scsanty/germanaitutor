import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { defaultKeyFilePath } from '@/lib/crypto/keyfile';
import { createProviderService } from '@/lib/services/providerService';

export async function GET() {
  const service = createProviderService(getDb(), defaultKeyFilePath());
  return NextResponse.json(service.listConnections());
}

export async function POST(request: Request) {
  const body = await request.json();
  const service = createProviderService(getDb(), defaultKeyFilePath());
  const connection = service.createConnection(body);
  return NextResponse.json(connection, { status: 201 });
}
