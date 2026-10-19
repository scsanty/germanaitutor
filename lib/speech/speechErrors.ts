// The service couldn't be reached (refused, reset, timed out). S1: with /health failing too, this is
// "the service is down" and never counts as an attempt; with /health OK it is a failed render (I1).
export class SpeechUnreachableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SpeechUnreachableError';
  }
}

// The service answered with an error (4xx/5xx), or the request was refused before sending.
export class SpeechServiceError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = 'SpeechServiceError';
  }
}

const UNREACHABLE = /ECONNREFUSED|ECONNRESET|ETIMEDOUT|EHOSTUNREACH|ENETUNREACH|ENOTFOUND|EAI_AGAIN|EPIPE|fetch failed|socket hang up/i;

// True for connection-level failures, including errors thrown by injected providers.
export function isUnreachableError(err: unknown): boolean {
  if (err instanceof SpeechUnreachableError) return true;
  if (!(err instanceof Error)) return false;
  if (err.name === 'AbortError' || err.name === 'TimeoutError') return true;
  const cause = (err as { cause?: { code?: string; message?: string } }).cause;
  return UNREACHABLE.test(err.message) || UNREACHABLE.test(cause?.code ?? '') || UNREACHABLE.test(cause?.message ?? '');
}
