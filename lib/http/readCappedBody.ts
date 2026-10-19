// Request bodies with a size cap, shared by the routes that accept raw uploads (audio, backups).

// True when the request declares a Content-Length above `max`, so it can be refused unread.
export function declaresMoreThan(request: Request, max: number): boolean {
  const declared = Number(request.headers.get('content-length') ?? NaN);
  return Number.isFinite(declared) && declared > max;
}

// Reads the body up to `max` bytes; null when it is larger (the rest is not read).
export async function readCappedBody(request: Request, max: number): Promise<Buffer | null> {
  if (!request.body) return Buffer.alloc(0);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}
