import { NextResponse } from 'next/server';
import { toSpeechClipErrorResponse } from '@/lib/services/speechClipService';
import { errorBody } from '@/lib/tutoring/errorCodes';

export function badRequest(message: string): NextResponse {
  return NextResponse.json(errorBody(message, 'bad_request'), { status: 400 });
}

// Runs a service call and maps SpeechClipError to its status and error body.
export async function respond(run: () => unknown | Promise<unknown>): Promise<NextResponse> {
  try {
    return NextResponse.json(await run());
  } catch (err) {
    const mapped = toSpeechClipErrorResponse(err);
    if (mapped) return NextResponse.json(mapped.body, { status: mapped.status });
    throw err;
  }
}
