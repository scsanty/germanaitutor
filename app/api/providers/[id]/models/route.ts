import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { defaultKeyFilePath } from '@/lib/crypto/keyfile';
import { createProviderService } from '@/lib/services/providerService';
import { getAdapter } from '@/lib/providers/registry';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const id = Number(params.id);
  const service = createProviderService(getDb(), defaultKeyFilePath());
  const connection = service.getConnection(id);
  if (!connection) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  try {
    const models = await getAdapter(connection.providerType).listModels({
      apiKey: service.getDecryptedApiKey(id) ?? undefined,
      host: connection.ollamaHost ?? undefined,
    });
    return NextResponse.json(models);
  } catch (error) {
    // A provider can be unreachable (Ollama not running, revoked key). Report it
    // rather than throwing, so callers can degrade to "no models available".
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not list models' },
      { status: 502 }
    );
  }
}
