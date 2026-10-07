import { NextResponse } from 'next/server';
import { isFreestyleMode, type FreestyleMode } from '@/lib/freestyle/modes';
import { toFreestyleErrorResponse } from '@/lib/services/freestyleService';
import { errorBody } from '@/lib/tutoring/errorCodes';

export type ModeProps = { params: Promise<{ mode: string }> };

export function badRequest(message: string): NextResponse {
  return NextResponse.json(errorBody(message, 'bad_request'), { status: 400 });
}

// Resolves the [mode] segment (I1: params is a Promise in Next 16); an unknown mode is a 404.
export async function modeOf(props: ModeProps): Promise<FreestyleMode | NextResponse> {
  const { mode } = await props.params;
  if (!isFreestyleMode(mode)) return NextResponse.json(errorBody(`Unknown mode: ${mode}`, 'not_found'), { status: 404 });
  return mode;
}

// Runs a service call and maps FreestyleError to its status and error body.
export async function respond(run: () => unknown | Promise<unknown>): Promise<NextResponse> {
  try {
    return NextResponse.json(await run());
  } catch (err) {
    const mapped = toFreestyleErrorResponse(err);
    if (mapped) return NextResponse.json(mapped.body, { status: mapped.status });
    throw err;
  }
}
