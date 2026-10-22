import { errorBodyFor, type ApiErrorBody, type ErrorCode, type ErrorParams } from '../tutoring/errorCodes';

// Exam practice errors, shared by the Teil runner (examPracticeService) and the spoken parts (spokenPartService).
export type PracticeErrorKind = 'not_found' | 'bad_request' | 'unavailable' | 'ai_failed';
const STATUS: Record<PracticeErrorKind, number> = { not_found: 404, bad_request: 400, unavailable: 409, ai_failed: 502 };
// S7: an unavailable part is a legitimate state with its own message, not a bad request.
const CODE: Record<PracticeErrorKind, ErrorCode> = { not_found: 'not_found', bad_request: 'bad_request', unavailable: 'part_unavailable', ai_failed: 'ai_failed' };

export class PracticeError extends Error {
  readonly code: ErrorCode;
  constructor(message: string, readonly kind: PracticeErrorKind, code?: ErrorCode, readonly params?: ErrorParams) {
    super(message);
    this.code = code ?? CODE[kind];
  }
}

export function toPracticeErrorResponse(err: unknown): { status: number; body: ApiErrorBody } | null {
  if (!(err instanceof PracticeError)) return null;
  return { status: STATUS[err.kind], body: errorBodyFor(err) };
}
