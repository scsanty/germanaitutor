// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { declaresMoreThan, readCappedBody } from './readCappedBody';

const post = (body: Uint8Array<ArrayBuffer> | undefined, headers: Record<string, string> = {}) =>
  new Request('http://localhost/x', { method: 'POST', body, headers });

describe('readCappedBody', () => {
  it('reads a body up to the cap and refuses one past it', async () => {
    expect((await readCappedBody(post(new Uint8Array(10)), 10))?.length).toBe(10);
    expect(await readCappedBody(post(new Uint8Array(11)), 10)).toBeNull();
    expect((await readCappedBody(post(undefined), 10))?.length).toBe(0);
  });

  it('refuses a body streamed in chunks once the running total passes the cap', async () => {
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        for (let i = 0; i < 5; i += 1) c.enqueue(new Uint8Array(4));
        c.close();
      },
    });
    const req = new Request('http://localhost/x', { method: 'POST', body, duplex: 'half' } as RequestInit);
    expect(await readCappedBody(req, 15)).toBeNull();
  });

  it('checks a declared Content-Length', () => {
    expect(declaresMoreThan(post(undefined, { 'content-length': '11' }), 10)).toBe(true);
    expect(declaresMoreThan(post(undefined, { 'content-length': '10' }), 10)).toBe(false);
    expect(declaresMoreThan(post(undefined), 10)).toBe(false);
  });
});
