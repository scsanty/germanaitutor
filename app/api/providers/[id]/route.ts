import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { defaultKeyFilePath } from '@/lib/crypto/keyfile';
import { createProviderService } from '@/lib/services/providerService';

export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const body = await request.json();
  const service = createProviderService(getDb(), defaultKeyFilePath());
  const id = Number(params.id);
  const updated = service.updateConnection(id, body);
  if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  // A new model, key or host is checked straight away, so the status shown is never stale.
  if (['selectedModel', 'apiKey', 'ollamaHost'].some((field) => body?.[field] !== undefined)) {
    await service.testConnection(id);
    return NextResponse.json(service.getConnection(id));
  }
  return NextResponse.json(updated);
}

export async function DELETE(_request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const service = createProviderService(getDb(), defaultKeyFilePath());
  service.deleteConnection(Number(params.id));
  return new NextResponse(null, { status: 204 });
}
