export interface FakeResponse {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}

// Resolves on a real timer so React re-renders before the response lands; an
// instantly-resolved promise hides effect-ordering bugs.
export function delayedResponse(
  body: unknown,
  options: { ok?: boolean; status?: number; ms?: number } = {}
): Promise<FakeResponse> {
  const ok = options.ok ?? true;
  const status = options.status ?? (ok ? 200 : 500);
  return new Promise((resolve) =>
    setTimeout(() => resolve({ ok, status, json: async () => body }), options.ms ?? 5)
  );
}
