import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { defaultKeyFilePath } from '@/lib/crypto/keyfile';
import { createProviderService } from '@/lib/services/providerService';

export async function POST(_request: Request, { params }: { params: { id: string } }) {
  const service = createProviderService(getDb(), defaultKeyFilePath());
  const result = await service.testConnection(Number(params.id));
  return NextResponse.json(result);
}
