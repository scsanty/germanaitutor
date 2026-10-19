import type { RenderInput, SpeechProvider } from './speechProvider';
import { SpeechServiceError, SpeechUnreachableError } from './speechErrors';

// The sidecar's body limits (speech/audio_core.py); a larger body is refused here instead of sent.
export const MAX_RENDER_BYTES = 1024 * 1024;
export const MAX_CONVERT_BYTES = 25 * 1024 * 1024;

const HEALTH_TIMEOUT_MS = 3000;
const BASE_TIMEOUT_MS = 60_000;
const TIMEOUT_MS_PER_CHAR = 15;
const MAX_RENDER_TIMEOUT_MS = 115_000;

// Final review I1: a long C1 transcript (thousands of characters) takes longer to synthesize than a
// short one, so the render timeout grows with the text, capped below the sidecar's 120 s ffmpeg limit.
export function renderTimeoutMs(input: RenderInput): number {
  const chars = input.segments.reduce((n, s) => n + s.text.length, 0);
  return Math.min(MAX_RENDER_TIMEOUT_MS, BASE_TIMEOUT_MS + chars * TIMEOUT_MS_PER_CHAR);
}

// The sidecar answers errors as `{"error": "..."}`; anything else is passed on as text.
async function errorText(res: Response): Promise<string> {
  const text = await res.text().catch(() => '');
  try {
    const body = JSON.parse(text) as { error?: unknown; detail?: { error?: unknown } };
    const message = body.error ?? body.detail?.error;
    if (typeof message === 'string') return message;
  } catch {
    // not JSON
  }
  return text.slice(0, 500);
}

// S6: AbortSignal.timeout (not a hand-made controller) so Node's fetch accepts the signal in every environment.
async function post(url: string, body: BodyInit, headers: Record<string, string>, timeoutMs = BASE_TIMEOUT_MS): Promise<Buffer> {
  let res: Response;
  try {
    res = await fetch(url, { method: 'POST', headers, body, signal: AbortSignal.timeout(timeoutMs) });
  } catch (err) {
    const cause = (err as { cause?: { code?: string; message?: string } }).cause;
    const detail = cause?.code ?? cause?.message ?? (err as Error).message;
    throw new SpeechUnreachableError(`speech service unreachable: ${(err as Error).name === 'TimeoutError' ? 'timed out' : detail}`);
  }
  if (!res.ok) throw new SpeechServiceError(`speech service ${res.status}: ${await errorText(res)}`, res.status);
  try {
    return Buffer.from(await res.arrayBuffer());
  } catch (err) {
    throw new SpeechUnreachableError(`speech service unreachable: ${(err as Error).message}`);
  }
}

export function createLocalSpeechProvider(baseUrl: string): SpeechProvider {
  const url = (path: string) => `${baseUrl.replace(/\/+$/, '')}${path}`;
  return {
    async health() {
      try {
        const res = await fetch(url('/health'), { signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS) });
        if (!res.ok) return { ok: false, voices: [] };
        const body = (await res.json()) as { ok?: boolean; voices?: unknown };
        const voices = Array.isArray(body.voices) ? body.voices.filter((v): v is string => typeof v === 'string') : [];
        return { ok: body.ok !== false, voices };
      } catch {
        return { ok: false, voices: [] };
      }
    },
    async render(input) {
      const body = JSON.stringify(input);
      if (Buffer.byteLength(body) > MAX_RENDER_BYTES) throw new SpeechServiceError('speech service 413: the transcript is too long to render', 413);
      return post(url('/render'), body, { 'Content-Type': 'application/json' }, renderTimeoutMs(input));
    },
    async convert(data) {
      if (data.length > MAX_CONVERT_BYTES) throw new SpeechServiceError('speech service 413: the recording is larger than 25 MB', 413);
      return post(url('/convert'), new Uint8Array(data), { 'Content-Type': 'application/octet-stream' });
    },
  };
}
