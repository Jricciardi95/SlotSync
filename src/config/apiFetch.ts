/**
 * All HTTP calls to the SlotSync backend (not the ESP32 shelf) should use `apiFetch`
 * so optional beta API keys are attached consistently.
 *
 * Health checks use GET /health (no /api prefix) — use plain `fetch` in api.ts only.
 */

/** Shared secret for private beta; embedded in the app bundle (not obfuscation). */
export function getBackendAuthHeaders(): Record<string, string> {
  const key =
    process.env.EXPO_PUBLIC_SLOTSYNC_API_KEY?.trim() ||
    process.env.EXPO_PUBLIC_API_KEY?.trim();
  if (!key) {
    return {};
  }
  return { 'X-SlotSync-Api-Key': key };
}

/**
 * fetch() with merged auth headers for `/api/*` routes.
 */
export function apiFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  const auth = getBackendAuthHeaders();
  for (const [k, v] of Object.entries(auth)) {
    if (!headers.has(k)) {
      headers.set(k, v);
    }
  }
  return fetch(input, { ...init, headers });
}
