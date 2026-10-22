import { getDb } from '@/lib/db/client';
import { isValidScope } from '@/lib/speech/clips';
import { createSpeechClipService } from '@/lib/services/speechClipService';
import { badRequest, respond } from '../respond';

export const dynamic = 'force-dynamic';

// DELETE ?scope=… removes the scope's recordings and transcripts.
export async function DELETE(request: Request) {
  const scope = new URL(request.url).searchParams.get('scope');
  if (!isValidScope(scope)) return badRequest('Invalid scope');
  return respond(() => {
    createSpeechClipService(getDb()).deleteScope(scope);
    return { ok: true };
  });
}
