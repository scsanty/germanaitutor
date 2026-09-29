import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { defaultKeyFilePath } from '@/lib/crypto/keyfile';
import { createProviderService } from '@/lib/services/providerService';

export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const body = await request.json();
  const service = createProviderService(getDb(), defaultKeyFilePath());
  const updated = service.updateConnection(Number(params.id), body);
  if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(updated);
}

export async function DELETE(_request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const service = createProviderService(getDb(), defaultKeyFilePath());
  service.deleteConnection(Number(params.id));
  return new NextResponse(null, { status: 204 });
}
